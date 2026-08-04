import prisma from "../connection.js";
import { generateEmbeddings, generateImageEmbedding } from "./embeddingService.js";
import logger from "../logger.js";

/**
 * Split text into chunks of specified maximum character length with overlap.
 * 
 * @param {string} text 
 * @param {number} chunkSize 
 * @param {number} overlap 
 * @returns {string[]}
 */
function chunkText(text, chunkSize = 1000, overlap = 150) {
    if (!text || typeof text !== "string") return [];
    
    const trimmed = text.trim();
    if (trimmed.length <= chunkSize) {
        return [trimmed];
    }

    const chunks = [];
    let start = 0;

    while (start < trimmed.length) {
        let end = start + chunkSize;
        if (end < trimmed.length) {
            // Try to end at a paragraph or sentence boundary
            const lastSpace = trimmed.lastIndexOf(" ", end);
            if (lastSpace > start + chunkSize / 2) {
                end = lastSpace;
            }
        }

        const chunk = trimmed.slice(start, end).trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        start = end - overlap;
        if (start >= trimmed.length || end >= trimmed.length) break;
    }

    return chunks;
}

/**
 * Generates embeddings for document text chunks and stores them in the document_chunks table.
 * 
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID
 * @param {number|BigInt} params.documentId - Document ID
 * @param {string} params.content - Extracted document text content
 * @returns {Promise<number>} Number of chunks stored
 */
async function storeDocumentChunks({ userId, documentId, content }) {
    if (!userId || !documentId || !content) {
        logger.warn({ userId: Number(userId), documentId: Number(documentId) }, "storeDocumentChunks called with missing parameters");
        return 0;
    }

    try {
        const uId = BigInt(userId);
        const dId = BigInt(documentId);

        // Chunk the full document text first
        const chunks = chunkText(content);
        logger.debug({ documentId: Number(dId), chunkCount: chunks.length }, "Document split into chunks");

        if (chunks.length === 0) {
            return 0;
        }

        // Generate all embeddings in a single batched call (search_document for storage)
        const embeddings = await generateEmbeddings(chunks, "search_document");

        // Wrap delete-then-insert in a single transaction so the replacement is all-or-nothing
        const storedCount = await prisma.$transaction(async (tx) => {
            // Delete any existing chunks for this document (e.g., re-processing)
            await tx.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${dId}`;

            for (let i = 0; i < chunks.length; i++) {
                // Format float array to PostgreSQL vector format: "[0.1, -0.2, ...]"
                const vectorString = `[${embeddings[i].join(",")}]`;

                await tx.$executeRaw`INSERT INTO document_chunks (user_id, document_id, content, embedding) VALUES (${uId}, ${dId}, ${chunks[i]}, ${vectorString}::vector)`;
            }

            return chunks.length;
        });

        logger.info(
            { documentId: Number(dId), userId: Number(uId), storedChunks: storedCount },
            "Document chunks and vector embeddings successfully stored"
        );

        return storedCount;
    } catch (err) {
        logger.error(
            { err, documentId: Number(documentId), userId: Number(userId) },
            "Failed to store document chunks and embeddings"
        );
        throw err;
    }
}

/**
 * Stores a single embedding for an image document (or a scanned PDF page
 * rendered to an image) in the document_chunks table.
 *
 * A full-document image is stored as ONE chunk — the image is sent directly
 * to Cohere's image embedding API (inputType "image") and the resulting
 * vector is stored alongside a short descriptor. This makes image-only
 * documents searchable without any text extraction step.
 *
 * Cohere stores the image embedding semantically, so a vector search can
 * match this document against queries like "expiry date", "warranty period",
 * "purchase date", etc.
 *
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID
 * @param {number|BigInt} params.documentId - Document ID
 * @param {string} params.imageDataUrl - Data URI of the image to embed
 * @param {string} [params.descriptor] - Short text descriptor stored alongside the embedding
 * @returns {Promise<number>} 1 if the chunk was stored, 0 otherwise
 */
async function storeDocumentImageEmbedding({ userId, documentId, imageDataUrl, descriptor }) {
    if (!userId || !documentId || !imageDataUrl) {
        logger.warn(
            { userId: Number(userId), documentId: Number(documentId) },
            "storeDocumentImageEmbedding called with missing parameters"
        );
        return 0;
    }

    try {
        const uId = BigInt(userId);
        const dId = BigInt(documentId);

        const embedding = await generateImageEmbedding(imageDataUrl);

        const content =
            descriptor ||
            "Warranty / invoice document image. Includes purchase date, item name, expiry date and warranty terms.";

        // Wrap delete-then-insert in a single transaction so the replacement is all-or-nothing
        const stored = await prisma.$transaction(async (tx) => {
            // Delete any existing chunks for this document (e.g., re-processing)
            await tx.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${dId}`;

            const vectorString = `[${embedding.join(",")}]`;

            await tx.$executeRaw`INSERT INTO document_chunks (user_id, document_id, content, embedding) VALUES (${uId}, ${dId}, ${content}, ${vectorString}::vector)`;

            return 1;
        });

        logger.info(
            { documentId: Number(dId), userId: Number(uId) },
            "Document image embedding successfully stored"
        );

        return stored;
    } catch (err) {
        logger.error(
            { err, documentId: Number(documentId), userId: Number(userId) },
            "Failed to store document image embedding"
        );
        throw err;
    }
}

export { storeDocumentChunks, storeDocumentImageEmbedding, chunkText };
