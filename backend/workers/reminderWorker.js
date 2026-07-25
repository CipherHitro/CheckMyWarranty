// workers/reminderWorker.js
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { REMINDER_QUEUE_NAME } from "../queues/reminderQueue.js";
import prisma from "../connection.js";
import { sendReminderEmail } from "../services/brevoEmailService.js";
import logger from "../logger.js";

export const reminderWorker = new Worker(
  REMINDER_QUEUE_NAME,
  async (job) => {
    const { reminderId, userEmail, documentName, daysBefore, expiryDate } = job.data;

    logger.info({ reminderId, jobId: job.id }, `Processing ${daysBefore}-day reminder job`);

    // 1. Fetch reminder from DB to ensure it wasn't deleted or already sent
    const reminder = await prisma.reminders.findUnique({
      where: { id: BigInt(reminderId) },
    });

    if (!reminder) {
      logger.warn({ reminderId }, `Job ${job.id} skipped: Reminder not found in database`);
      return;
    }

    if (reminder.status !== "pending") {
      logger.info(
        { reminderId, status: reminder.status },
        `Job ${job.id} skipped: Reminder already processed`
      );
      return;
    }

    // 2. Send the email using your existing Brevo service
    const result = await sendReminderEmail(userEmail, documentName, expiryDate, daysBefore);

    if (!result.success) {
      // Worker will retry based on job options (3 attempts, exponential backoff)
      throw new Error(`Failed to send email: ${result.error}`);
    }

    // 3. Mark reminder as sent in database
    await prisma.reminders.update({
      where: { id: BigInt(reminderId) },
      data: { status: "sent" },
    });

    logger.info(
      { reminderId, daysBefore, documentName, userEmail },
      `Successfully sent ${daysBefore}-day reminder for ${documentName}`
    );
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs simultaneously
  }
);

reminderWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Worker job completed");
});

reminderWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Worker job failed");
});