import { CohereClient } from "cohere-ai";
import logger from "../logger.js";
import "dotenv/config";

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

const EMBEDDING_MODEL = "embed-v4.0";
const EMBEDDING_DIM = 1024;
const BATCH_SIZE = 96; // Cohere embed endpoint accepts up to 96 texts per call

/**
 * Generate embeddings for an array of texts using Cohere's embed-v4.0 model.
 *
 * If the input array exceeds 96 items, it is split into batches of 96 and
 * multiple API calls are made, with the results concatenated in order.
 *
 * @param {string[]} texts - Array of text strings to embed
 * @param {"search_document"|"search_query"} inputType - Cohere input type:
 *   use "search_document" when embedding chunks for storage,
 *   use "search_query" when embedding a user question at retrieval time
 * @returns {Promise<number[][]>} Array of embedding vectors, same order as input
 * @throws {Error} If the Cohere API call fails — the error propagates so the
 *   caller (e.g. a BullMQ job) can retry. No fake/deterministic fallback.
 */
async function generateEmbeddings(texts, inputType) {
    if (!Array.isArray(texts) || texts.length === 0) {
        return [];
    }

    if (inputType !== "search_document" && inputType !== "search_query") {
        throw new Error(
            `Invalid inputType "${inputType}". Must be "search_document" or "search_query".`
        );
    }

    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);

        try {
            const response = await cohere.v2.embed({
                model: EMBEDDING_MODEL,
                texts: batch,
                inputType,
                outputDimension: EMBEDDING_DIM,
                embeddingTypes: ["float"],
            });

            // Response shape depends on responseType
            let batchEmbeddings;
            if (response.responseType === "embeddings_floats") {
                batchEmbeddings = response.embeddings;
            } else if (response.responseType === "embeddings_by_type") {
                batchEmbeddings = response.embeddings?.float;
            } else {
                throw new Error(`Unexpected Cohere response type: ${response.responseType}`);
            }

            if (!Array.isArray(batchEmbeddings) || batchEmbeddings.length !== batch.length) {
                throw new Error(
                    `Embedding count mismatch: expected ${batch.length}, got ${batchEmbeddings?.length ?? "undefined"}`
                );
            }

            allEmbeddings.push(...batchEmbeddings);

            logger.debug(
                { batchSize: batch.length, inputType, model: EMBEDDING_MODEL, dim: EMBEDDING_DIM },
                "Generated embeddings batch via Cohere API"
            );
        } catch (err) {
            logger.error(
                { error: err.message || err, model: EMBEDDING_MODEL, inputType, batchSize: batch.length },
                "Cohere API embeddings call failed"
            );
            throw err;
        }
    }

    return allEmbeddings;
}

/**
 * Generate an embedding for a single image using Cohere's embed-v4.0 model.
 *
 * Cohere's image embedding endpoint accepts exactly ONE image per call and
 * requires the image as a data URI (data:mimeType;base64,...). Supported
 * formats: image/jpeg, image/png, image/webp, image/gif (max 5MB).
 *
 * @param {string} imageDataUrl - Data URI of the image, e.g. "data:image/jpeg;base64,/9j/..."
 * @returns {Promise<number[]>} Embedding vector for the image
 * @throws {Error} If the Cohere API call fails — the error propagates so the
 *   caller (e.g. a BullMQ job) can retry.
 */
async function generateImageEmbedding(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:")) {
    throw new Error("generateImageEmbedding requires a valid data URI");
  }

  try {
    const response = await cohere.v2.embed({
      model: EMBEDDING_MODEL,
      images: [imageDataUrl],
      inputType: "image",
      outputDimension: EMBEDDING_DIM,
      embeddingTypes: ["float"],
    });

    let embeddings;
    if (response.responseType === "embeddings_floats") {
      embeddings = response.embeddings;
    } else if (response.responseType === "embeddings_by_type") {
      embeddings = response.embeddings?.float;
    } else {
      throw new Error(`Unexpected Cohere response type: ${response.responseType}`);
    }

    if (!Array.isArray(embeddings) || embeddings.length !== 1) {
      throw new Error(
        `Image embedding count mismatch: expected 1, got ${embeddings?.length ?? "undefined"}`
      );
    }

    logger.debug(
      { model: EMBEDDING_MODEL, dim: EMBEDDING_DIM, inputType: "image" },
      "Generated image embedding via Cohere API"
    );

    return embeddings[0];
  } catch (err) {
    logger.error(
      { error: err.message || err, model: EMBEDDING_MODEL, inputType: "image" },
      "Cohere API image embedding call failed"
    );
    throw err;
  }
}

export { generateEmbeddings, generateImageEmbedding, EMBEDDING_DIM };