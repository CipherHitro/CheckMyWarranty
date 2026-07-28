import prisma from "../connection.js";
import logger from "../logger.js";
import { scheduleReminderJob } from "../queues/reminderQueue.js";

// Days before expiry at which each reminder should fire
const REMINDER_DAYS = [7, 3, 1];

/**
 * Create reminders for a document based on its expiry date.
 * Creates 3 separate reminder records (7-day, 3-day, 1-day) and
 * schedules a BullMQ job for each with the appropriate delay.
 * All times use UTC internally — 3:30 UTC = 9:00 AM IST.
 *
 * @param {bigint} userId - The user's ID
 * @param {bigint} documentId - The document's ID
 * @param {string} userEmail - The user's email address
 * @param {string} documentName - The original filename
 * @param {string|Date} expiryDate - The expiry date of the document
 */
async function createReminders(userId, documentId, userEmail, documentName, expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);

  if (expiry <= now) {
    logger.info(
      { documentId: Number(documentId) },
      "Reminders skipped — expiry already passed"
    );
    return;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((expiry - now) / msPerDay);

  for (const daysBefore of REMINDER_DAYS) {
    if (daysRemaining < daysBefore) {
      logger.debug(
        { documentId: Number(documentId), daysBefore, daysRemaining },
        `Skipping ${daysBefore}-day reminder — not enough days remaining`
      );
      continue;
    }

    // Calculate remind_at using UTC methods
    // 3:30 UTC = 9:00 AM IST — this works regardless of server timezone
    const remindAt = new Date(expiry);
    remindAt.setUTCDate(remindAt.getUTCDate() - daysBefore);
    remindAt.setUTCHours(3, 30, 0, 0); // 3:30 UTC = 9:00 AM IST

    if (remindAt <= now) {
      logger.debug(
        { documentId: Number(documentId), daysBefore, remindAt: remindAt.toISOString() },
        `Skipping ${daysBefore}-day reminder — remind_at already passed`
      );
      continue;
    }

    // Create the reminder record in the database
    const reminder = await prisma.reminders.create({
      data: {
        user_id: userId,
        document_id: documentId,
        remind_at: remindAt,
        status: "pending",
      },
    });

    logger.info(
      {
        documentId: Number(documentId),
        reminderId: Number(reminder.id),
        daysBefore,
        remindAt: remindAt.toISOString(),
        remindAtIST: remindAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      },
      `Reminder record created for ${daysBefore}-day notification`
    );

    // Schedule the BullMQ job for this reminder
    await scheduleReminderJob({
      reminderId: Number(reminder.id),
      userId: Number(userId),
      userEmail,
      documentName,
      daysBefore,
      expiryDate: expiry.toISOString(),
    });
  }
}

export { createReminders };