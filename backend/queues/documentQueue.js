import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import logger from "../logger.js";

export const DOCUMENT_QUEUE_NAME = "document-processing";

export const documentQueue = new Queue(DOCUMENT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed extraction/embedding up to 3 times
    backoff: { type: "exponential", delay: 10000 }, // 10s, 20s, 40s
    removeOnComplete: true, // Auto-clean completed jobs
    removeOnFail: false, // Keep failed jobs for debugging
  },
});

/**
 * Add a document processing job to the queue.
 * The worker will:
 *   1. Extract warranty details via AI (Groq)
 *   2. Store text chunks + vector embeddings (Cohere)
 *   3. Update rag_status and send SSE notifications
 *
 * Jobs are processed one at a time (concurrency: 1) to avoid
 * flooding the AI APIs with concurrent requests when multiple
 * users upload documents simultaneously.
 *
 * @param {Object} params
 * @param {number|BigInt} params.documentId - Document record ID
 * @param {number|BigInt} params.userId - User who uploaded the document
 * @param {string} params.userEmail - User's email (for reminders)
 * @param {string} params.originalFilename - Original file name
 * @param {string} params.filePath - Path to the file on disk for extraction
 */
export async function addDocumentJob({ documentId, userId, userEmail, originalFilename, filePath }) {
  const jobId = `doc-${documentId}`;

  await documentQueue.add(
    "process-document",
    { documentId, userId, userEmail, originalFilename, filePath },
    { jobId }
  );

  logger.info(
    { documentId: Number(documentId), userId: Number(userId), originalFilename, jobId },
    "Document processing job added to queue"
  );
}