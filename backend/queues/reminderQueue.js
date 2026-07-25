// queues/reminderQueue.js
import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import logger from "../logger.js";

export const REMINDER_QUEUE_NAME = "warranty-reminders";

export const reminderQueue = new Queue(REMINDER_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed email sends up to 3 times
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true, // Auto-clean completed jobs
  },
});

/**
 * Helper to schedule a delayed reminder email job.
 * Called once per reminder record (7d, 3d, 1d).
 */
export async function scheduleReminderJob({ reminderId, userId, userEmail, documentName, daysBefore, expiryDate }) {
  // Calculate the delay from now until the reminder should fire
  const targetDate = new Date(expiryDate);
  targetDate.setDate(targetDate.getDate() - daysBefore);
  targetDate.setHours(9, 0, 0, 0); // Send at 9 AM

  const delayMs = targetDate.getTime() - Date.now();

  // If the target date is already in the past, skip scheduling
  if (delayMs <= 0) {
    logger.info(
      { reminderId, daysBefore, documentName },
      `Skipping ${daysBefore}-day job — target date already passed`
    );
    return;
  }

  // Unique jobId prevents duplicate scheduling for the same reminder
  const jobId = `reminder-${reminderId}`;

  await reminderQueue.add(
    "send-warranty-reminder",
    { reminderId, userId, userEmail, documentName, daysBefore, expiryDate },
    { delay: delayMs, jobId }
  );

  logger.info(
    { reminderId, daysBefore, documentName, delayMinutes: Math.round(delayMs / 1000 / 60) },
    `Scheduled ${daysBefore}-day reminder for ${documentName}`
  );
}