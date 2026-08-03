import { Worker } from "bullmq";
import fs from "fs";
import { redisConnection } from "../config/redis.js";
import { DOCUMENT_QUEUE_NAME } from "../queues/documentQueue.js";
import prisma from "../connection.js";
import { extractWarrantyDetails } from "../services/extractWarranty.js";
import { storeDocumentChunks } from "../services/documentChunkService.js";
import { createReminders } from "../services/reminderService.js";
import { sendSseEventToUser } from "../config/sse.js";
import logger from "../logger.js";

const isProduction = process.env.mode === "production";

/**
 * Document processing worker.
 *
 * Processes jobs one at a time (concurrency: 1) to avoid flooding the
 * Groq and Cohere APIs with concurrent requests when multiple users
 * upload documents simultaneously.
 *
 * Each job:
 *   1. Extracts warranty details (expiry date, item name, content) via Groq
 *   2. Stores text chunks + vector embeddings via Cohere
 *   3. Updates rag_status (pending → ready / failed)
 *   4. Sends SSE notifications to the user
 *   5. Cleans up temp files
 */
export const documentWorker = new Worker(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    const { documentId, userId, userEmail, originalFilename, filePath } = job.data;

    logger.info(
      { documentId: Number(documentId), jobId: job.id, attempt: job.attemptsMade + 1, originalFilename },
      "Processing document job"
    );

    // ── Step 1: AI warranty extraction ──
    const extracted = await extractWarrantyDetails(filePath, originalFilename);

    // Clean up temp file in production after extraction
    if (isProduction) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    if (!extracted) {
      logger.warn(
        { documentId: Number(documentId) },
        "Extraction returned null — marking as failed"
      );
      await prisma.documents.update({
        where: { id: BigInt(documentId) },
        data: { rag_status: "failed" },
      });
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

    // ── Step 3: RAG pipeline — store chunks & vector embeddings ──
    if (extracted.content) {
      try {
        await storeDocumentChunks({
          userId: BigInt(userId),
          documentId: BigInt(documentId),
          content: extracted.content,
        });

        // RAG pipeline succeeded — document is now searchable
        await prisma.documents.update({
          where: { id: BigInt(documentId) },
          data: { rag_status: "ready" },
        });
        logger.info(
          { documentId: Number(documentId) },
          "RAG status updated to ready"
        );
      } catch (chunkErr) {
        logger.error(
          { err: chunkErr, documentId: Number(documentId) },
          "Failed to store document vector chunks"
        );

        // RAG pipeline failed — mark document as not searchable
        await prisma.documents.update({
          where: { id: BigInt(documentId) },
          data: { rag_status: "failed" },
        });
        // Re-throw so BullMQ can retry the entire job
        throw chunkErr;
      }
    } else {
      // No content to embed — document is not searchable
      await prisma.documents.update({
        where: { id: BigInt(documentId) },
        data: { rag_status: "failed" },
      });
      logger.warn(
        { documentId: Number(documentId) },
        "No content extracted — RAG status set to failed"
      );
    }

    logger.info(
      { documentId: Number(documentId), jobId: job.id },
      "Document processing job completed"
    );
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one document at a time — prevents API flooding
  }
);

documentWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id, documentId: job.data?.documentId }, "Document worker job completed");
});

documentWorker.on("failed", async (job, err) => {
  logger.error(
    { jobId: job?.id, documentId: job?.data?.documentId, err: err.message },
    "Document worker job failed"
  );

  // If all retry attempts exhausted, mark document as failed
  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    try {
      const documentId = job.data?.documentId;
      if (documentId) {
        await prisma.documents.update({
          where: { id: BigInt(documentId) },
          data: { rag_status: "failed" },
        });
        logger.warn(
          { documentId: Number(documentId), jobId: job.id },
          "Max retries reached — document marked as failed"
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
      logger.error({ err: dbErr }, "Failed to update rag_status to failed");
    }
  }
});