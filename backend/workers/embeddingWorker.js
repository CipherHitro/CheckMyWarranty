import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { redisConnection } from "../config/redis.js";
import { EMBEDDING_QUEUE_NAME } from "../queues/documentQueue.js";
import prisma from "../connection.js";
import { storeDocumentChunks, storeDocumentImageEmbedding } from "../services/documentChunkService.js";
import { extractPdfText } from "../services/extractWarranty.js";
import { sendSseEventToUser } from "../config/sse.js";
import logger from "../logger.js";

const isProduction = process.env.mode === "production";

// ── Minimum characters to consider a PDF "text-based" ───────────
const MIN_TEXT_LENGTH = 80;

// ── MIME type map for supported image formats ───────────────────
const IMAGE_MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Convert a file on disk into a data URI for Cohere image embeddings.
 *
 * @param {string} filePath - Path to the image file
 * @param {string} mimeType - MIME type of the image
 * @returns {string} data URI like "data:image/jpeg;base64,..."
 */
function fileToDataUri(filePath, mimeType) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64File = fileBuffer.toString("base64");
  return `data:${mimeType};base64,${base64File}`;
}

/**
 * Render the first page of a PDF to an image data URI (for scanned PDFs).
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string|null>} Data URI of the rendered page, or null on failure
 */
async function renderPdfFirstPageToDataUri(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  const screenshots = await parser.getScreenshot({
    first: 1,
    scale: 2,
    imageBuffer: true,
    imageDataUrl: true,
  });

  if (!screenshots.pages.length || !screenshots.pages[0].dataUrl) {
    logger.error("Could not render PDF page to image");
    return null;
  }

  return screenshots.pages[0].dataUrl;
}

/**
 * Document embedding worker (RAG).
 *
 * Processes jobs one at a time (concurrency: 1) to avoid flooding the
 * Cohere API when multiple users upload documents simultaneously.
 *
 * Each job:
 *   1. Determines the file type:
 *        - Image → sends the image DIRECTLY to Cohere's image embedding API
 *        - PDF   → extracts text via PDF-parse:
 *            - Text-based PDF → sends the extracted text to Cohere embeddings
 *            - Scanned PDF    → renders first page to an image and sends that
 *                               image directly to Cohere's image embedding API
 *   2. Stores the resulting vector chunks in document_chunks
 *   3. Updates rag_status (pending → ready / failed)
 *   4. Sends SSE notifications to the user
 *   5. Cleans up its own temp file copy
 *
 * IMPORTANT: This worker runs FULLY INDEPENDENTLY of the expiry date
 * extraction worker. It does not call Groq at all.
 */
export const embeddingWorker = new Worker(
  EMBEDDING_QUEUE_NAME,
  async (job) => {
    const { documentId, userId, originalFilename, filePath } = job.data;

    logger.info(
      { documentId: Number(documentId), jobId: job.id, attempt: job.attemptsMade + 1, originalFilename },
      "Processing embedding job (RAG)"
    );

    try {
      const ext = path.extname(originalFilename || "").toLowerCase();
      const isPDF = ext === ".pdf";
      const isImg = Boolean(IMAGE_MIME_MAP[ext]);

      let stored = 0;

      if (isImg) {
        // ── Image document → send image directly to Cohere ──
        logger.debug(
          { documentId: Number(documentId), ext },
          "Image document — embedding image directly via Cohere"
        );

        const imageDataUrl = fileToDataUri(filePath, IMAGE_MIME_MAP[ext]);
        stored = await storeDocumentImageEmbedding({
          userId: BigInt(userId),
          documentId: BigInt(documentId),
          imageDataUrl,
        });
      } else if (isPDF) {
        // ── PDF document → extract text first ──
        const text = await extractPdfText(filePath);

        if (text.length >= MIN_TEXT_LENGTH) {
          // Text-based PDF → embed the extracted text
          logger.debug(
            { documentId: Number(documentId), charCount: text.length },
            "PDF has sufficient text — embedding extracted text"
          );
          stored = await storeDocumentChunks({
            userId: BigInt(userId),
            documentId: BigInt(documentId),
            content: text,
          });
        } else {
          // Scanned PDF (no extractable text) → render page to image and embed it
          logger.debug(
            { documentId: Number(documentId), charCount: text.length },
            "PDF text too short — rendering page to image and embedding"
          );
          const imageDataUrl = await renderPdfFirstPageToDataUri(filePath);
          if (!imageDataUrl) {
            throw new Error("Could not render scanned PDF page to image");
          }
          stored = await storeDocumentImageEmbedding({
            userId: BigInt(userId),
            documentId: BigInt(documentId),
            imageDataUrl,
          });
        }
      } else {
        logger.warn({ documentId: Number(documentId), ext }, "Unsupported file type for embedding");
        throw new Error(`Unsupported file type for embedding: ${ext}`);
      }

      // Clean up temp file — this worker owns its own copy
      if (isProduction) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }

      if (stored > 0) {
        // RAG pipeline succeeded — document is now searchable
        await prisma.documents.update({
          where: { id: BigInt(documentId) },
          data: { rag_status: "ready" },
        });
        logger.info(
          { documentId: Number(documentId), stored },
          "RAG status updated to ready"
        );
        sendSseEventToUser(BigInt(userId), "embedding-complete", {
          documentId: Number(documentId),
          chunks: stored,
        });
      } else {
        // Nothing stored — mark as failed
        await prisma.documents.update({
          where: { id: BigInt(documentId) },
          data: { rag_status: "failed" },
        });
        logger.warn(
          { documentId: Number(documentId) },
          "No embeddings stored — RAG status set to failed"
        );
        sendSseEventToUser(BigInt(userId), "embedding-failed", {
          documentId: Number(documentId),
        });
      }

      logger.info(
        { documentId: Number(documentId), jobId: job.id },
        "Embedding job completed (RAG)"
      );
    } catch (err) {
      // Clean up temp file even on failure
      if (isProduction) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }

      logger.error(
        { err, documentId: Number(documentId), jobId: job.id },
        "Embedding job failed — marking document as not searchable"
      );

      // RAG pipeline failed — mark document as not searchable
      await prisma.documents.update({
        where: { id: BigInt(documentId) },
        data: { rag_status: "failed" },
      });

      // Re-throw so BullMQ can retry the job
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one document at a time — prevents Cohere API flooding
  }
);

embeddingWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id, documentId: job.data?.documentId }, "Embedding worker job completed");
});

embeddingWorker.on("failed", async (job, err) => {
  logger.error(
    { jobId: job?.id, documentId: job?.data?.documentId, err: err.message },
    "Embedding worker job failed"
  );

  // If all retry attempts exhausted, notify the user
  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    try {
      const documentId = job.data?.documentId;
      if (documentId) {
        logger.warn(
          { documentId: Number(documentId), jobId: job.id },
          "Max retries reached for embeddings — notifying user"
        );

        const userId = job.data?.userId;
        if (userId) {
          sendSseEventToUser(BigInt(userId), "embedding-failed", {
            documentId: Number(documentId),
          });
        }
      }
    } catch (dbErr) {
      logger.error({ err: dbErr }, "Failed to send embedding failure notification");
    }
  }
});