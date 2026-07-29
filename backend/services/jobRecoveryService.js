import prisma from "../connection.js";
import { reminderQueue } from "../queues/reminderQueue.js";
import logger from "../logger.js";

/**
 * On server startup, scan all pending reminders and ensure a corresponding
 * BullMQ job exists for each. This recovers jobs that were lost when Redis
 * data was wiped or the server went down unexpectedly.
 *
 * Flow for each pending reminder:
 *   1. remind_at  > now  → still waiting → check if job exists in Redis
 *      - Job exists      → do nothing
 *      - No job           → recreate it with the correct delay
 *   2. remind_at <= now   → overdue → process immediately (0 delay)
 */
export async function recoverPendingJobs() {
  logger.info("Job recovery: scanning for pending reminders…");

  try {
    const pendingReminders = await prisma.reminders.findMany({
      where: { status: "pending" },
      include: {
        documents: {
          select: { original_filename: true },
        },
        users: {
          select: { email: true },
        },
      },
    });

    if (pendingReminders.length === 0) {
      logger.info("Job recovery: no pending reminders found");
      return;
    }

    logger.info({ count: pendingReminders.length }, "Job recovery: pending reminders found");

    let recovered = 0;
    let overdue = 0;

    for (const reminder of pendingReminders) {
      const jobId = `reminder-${reminder.id}`;

      // Check if job already exists in the queue
      const existingJob = await reminderQueue.getJob(jobId);

      if (existingJob) {
        // Job exists — recovery not needed
        logger.debug({ reminderId: Number(reminder.id), jobId }, "Job recovery: job already exists — skipping");
        continue;
      }

      const now = new Date();
      const remindAt = new Date(reminder.remind_at);

      if (remindAt > now) {
        // Reminder is in the future — recreate job with correct delay
        const delayMs = remindAt.getTime() - now.getTime();

        await reminderQueue.add(
          "send-warranty-reminder",
          {
            reminderId: Number(reminder.id),
            userId: Number(reminder.user_id),
            userEmail: reminder.users.email,
            documentName: reminder.documents.original_filename,
            daysBefore: 0, // Not needed for recovery — we use the exact remind_at
            expiryDate: remindAt.toISOString(),
          },
          { delay: delayMs, jobId }
        );

        logger.info(
          {
            reminderId: Number(reminder.id),
            jobId,
            delayMinutes: Math.round(delayMs / 1000 / 60),
            remindAtIST: remindAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          },
          "Job recovery: future reminder job recreated"
        );
        recovered++;
      } else {
        // Overdue — process immediately with 0 delay
        await reminderQueue.add(
          "send-warranty-reminder",
          {
            reminderId: Number(reminder.id),
            userId: Number(reminder.user_id),
            userEmail: reminder.users.email,
            documentName: reminder.documents.original_filename,
            daysBefore: 0,
            expiryDate: remindAt.toISOString(),
          },
          { delay: 0, jobId }
        );

        logger.info(
          {
            reminderId: Number(reminder.id),
            jobId,
            remindAtIST: remindAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          },
          "Job recovery: overdue reminder queued for immediate processing"
        );
        overdue++;
      }
    }

    logger.info(
      { recovered, overdue, total: pendingReminders.length },
      "Job recovery complete"
    );
  } catch (error) {
    logger.error({ err: error }, "Job recovery: error during recovery");
  }
}