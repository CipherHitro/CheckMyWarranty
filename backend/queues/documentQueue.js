import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import logger from "../logger.js";

// ── Queue 1: Expiry date extraction ─────────────────────────────
export const EXTRACTION_QUEUE_NAME = "document-extraction";

// ── Queue 2: Document embeddings (RAG) ──────────────────────────
export const EMBEDDING_QUEUE_NAME = "document-embedding";

const defaultJobOptions = {
  attempts: 3, // Retry failed extraction/embedding up to 3 times
  backoff: { type: "exponential", delay: 10000 }, // 10s, 20s, 40s
  removeOnComplete: true, // Auto-clean completed jobs
  removeOnFail: false, // Keep failed jobs for debugging
};

export const extractionQueue = new Queue(EXTRACTION_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export const embeddingQueue = new Queue(EMBEDDING_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

/**
 * Add an expiry-date extraction job to the extraction queue.
 *
 * This worker ONLY extracts warranty details (expiry date, item name)
 * via Groq and updates the `expiry_date` column + creates reminders.
 * It does NOT generate embeddings — that runs independently in the
 * embedding queue.
 *
 * @param {Object} params
 * @param {number|BigInt} params.documentId - Document record ID
 * @param {number|BigInt} params.userId - User who uploaded the document
 * @param {string} params.userEmail - User's email (for reminders)
 * @param {string} params.originalFilename - Original file name
 * @param {string} params.filePath - Path to the temp file (worker's own copy)
 */
export async function addExtractionJob({ documentId, userId, userEmail, originalFilename, filePath }) {
  const jobId = `extract-${documentId}`;

  await extractionQueue.add(
    "extract-expiry",
    { documentId, userId, userEmail, originalFilename, filePath },
    { jobId }
  );

  logger.info(
    { documentId: Number(documentId), userId: Number(userId), originalFilename, jobId },
    "Extraction job added to queue (expiry date)"
  );
}

/**
 * Add an embedding job to the embedding queue.
 *
 * This worker ONLY generates Cohere embeddings for RAG search and
 * updates `rag_status`. It runs fully independently of the expiry
 * date extraction job:
 *   - Image → sends the image directly to Cohere (inputType "image")
 *   - PDF   → uses text extracted via PDF-parse, sends text to Cohere
 *
 * @param {Object} params
 * @param {number|BigInt} params.documentId - Document record ID
 * @param {number|BigInt} params.userId - User who uploaded the document
 * @param {string} params.originalFilename - Original file name
 * @param {string} params.filePath - Path to the temp file (worker's own copy)
 */
export async function addEmbeddingJob({ documentId, userId, originalFilename, filePath }) {
  const jobId = `embed-${documentId}`;

  await embeddingQueue.add(
    "embed-document",
    { documentId, userId, originalFilename, filePath },
    { jobId }
  );

  logger.info(
    { documentId: Number(documentId), userId: Number(userId), originalFilename, jobId },
    "Embedding job added to queue (RAG)"
  );
}