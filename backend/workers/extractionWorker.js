import { Worker } from "bullmq";
import fs from "fs";
import { redisConnection } from "../config/redis.js";
import { EXTRACTION_QUEUE_NAME } from "../queues/documentQueue.js";
import prisma from "../connection.js";
import { extractWarrantyDetails } from "../services/extractWarranty.js";
import { createReminders } from "../services/reminderService.js";
import { sendSseEventToUser } from "../config/sse.js";
import logger from "../logger.js";

const isProduction = process.env.mode === "production";

/**
 * Expiry date extraction worker.
 *
 * Processes jobs one at a time (concurrency: 1) to avoid flooding the
 * Groq API when multiple users upload documents simultaneously.
 *
 * Each job:
 *   1. Extracts warranty details (expiry date, item name, content) via Groq
 *   2. Updates the document's expiry_date in the DB
 *   3. Creates reminders and schedules email jobs
 *   4. Sends SSE notifications to the user
 *   5. Cleans up its own temp file copy
 *
 * IMPORTANT: This worker does NOT generate embeddings — RAG vector
 * embeddings run independently in the embedding worker.
 */
export const extractionWorker = new Worker(
  EXTRACTION_QUEUE_NAME,
  async (job) => {
    const { documentId, userId, userEmail, originalFilename, filePath } = job.data;

    logger.info(
      { documentId: Number(documentId), jobId: job.id, attempt: job.attemptsMade + 1, originalFilename },
      "Processing extraction job (expiry date)"
    );

    // ── Step 1: AI warranty extraction (expiry date) ──
    const extracted = await extractWarrantyDetails(filePath, originalFilename);

    // Clean up temp file — this worker owns its own copy
    if (isProduction) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    if (!extracted) {
      logger.warn(
        { documentId: Number(documentId) },
        "Extraction returned null — sending failure notification"
      );
      sendSseEventToUser(BigInt(userId), "extraction-failed", {
        documentId: Number(documentId),
      });
      return;
    }

    // ── Step 2: Update expiry date if extracted ──
    if (extracted.expiry_date) {
      const expiryDateObj = new Date(extracted.expiry_date + "T00:00:00.000Z");
      await prisma.documents.update({
        where: { id: BigInt(documentId) },
        data: { expiry_date: expiryDateObj },
      });
      logger.info(
        { documentId: Number(documentId), expiryDate: extracted.expiry_date },
        "Expiry date extracted and updated"
      );

      // Create reminders in the DB and schedule email jobs
      try {
        await createReminders(
          BigInt(userId),
          BigInt(documentId),
          userEmail,
          originalFilename,
          extracted.expiry_date
        );
      } catch (reminderErr) {
        logger.error(
          { err: reminderErr, documentId: Number(documentId) },
          "Failed to create reminders"
        );
      }

      // Notify the user via SSE
      sendSseEventToUser(BigInt(userId), "extraction-complete", {
        documentId: Number(documentId),
        expiry_date: extracted.expiry_date,
      });
    } else {
      logger.warn(
        { documentId: Number(documentId) },
        "Could not extract expiry date from document"
      );
      sendSseEventToUser(BigInt(userId), "extraction-no-date", {
        documentId: Number(documentId),
      });
    }

    logger.info(
      { documentId: Number(documentId), jobId: job.id },
      "Extraction job completed (expiry date)"
    );
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one document at a time — prevents Groq API flooding
  }
);

extractionWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id, documentId: job.data?.documentId }, "Extraction worker job completed");
});

extractionWorker.on("failed", async (job, err) => {
  logger.error(
    { jobId: job?.id, documentId: job?.data?.documentId, err: err.message },
    "Extraction worker job failed"
  );

  // If all retry attempts exhausted, notify the user
  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    try {
      const documentId = job.data?.documentId;
      if (documentId) {
        logger.warn(
          { documentId: Number(documentId), jobId: job.id },
          "Max retries reached for extraction — notifying user"
        );

        // Notify user via SSE
        const userId = job.data?.userId;
        if (userId) {
          sendSseEventToUser(BigInt(userId), "extraction-failed", {
            documentId: Number(documentId),
          });
        }
      }
    } catch (dbErr) {
      logger.error({ err: dbErr }, "Failed to send extraction failure notification");
    }
  }
});