import prisma from "../connection.js";
import { generateEmbeddings } from "./embeddingService.js";
import logger from "../logger.js";

/**
 * Retrieve the most relevant document chunks for a user's question using
 * pgvector cosine similarity search.
 *
 * The user's question is embedded with input_type "search_query" — the
 * retrieval-side counterpart to the "search_document" type used at storage
 * time. Using the correct type on each side is required for good retrieval.
 *
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID (scopes the search)
 * @param {string} params.question - The user's typed question
 * @param {number} [params.topK=5] - Number of chunks to return
 * @returns {Promise<Array<{id: number, document_id: number, content: string, similarity: number}>>}
 */
async function searchDocumentChunks({ userId, question, topK = 5 }) {
    if (!userId || !question || typeof question !== "string" || question.trim().length === 0) {
        return [];
    }

    try {
        const uId = BigInt(userId);

        // Embed the query with search_query input type (asymmetric pair with search_document)
        const [queryEmbedding] = await generateEmbeddings([question], "search_query");

        if (!queryEmbedding || queryEmbedding.length === 0) {
            throw new Error("Failed to generate query embedding");
        }

        // Format float array to PostgreSQL vector format: "[0.1, -0.2, ...]"
        const vectorString = `[${queryEmbedding.join(",")}]`;

        // Cosine similarity search via pgvector's <=> operator (1 - cosine_distance)
        const results = await prisma.$queryRaw`
            SELECT
                id,
                document_id,
                content,
                1 - (embedding <=> ${vectorString}::vector) AS similarity
            FROM document_chunks
            WHERE user_id = ${uId}
            ORDER BY embedding <=> ${vectorString}::vector
            LIMIT ${topK};
        `;

        const mapped = results.map((row) => ({
            id: Number(row.id),
            document_id: Number(row.document_id),
            content: row.content,
            similarity: Number(row.similarity),
        }));

        logger.debug(
            { userId: Number(uId), questionLength: question.length, resultCount: mapped.length },
            "Vector similarity search completed"
        );

        return mapped;
    } catch (err) {
        logger.error(
            { err, userId: Number(userId) },
            "Failed to search document chunks"
        );
        throw err;
    }
}

export { searchDocumentChunks };