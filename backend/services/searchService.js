import prisma from "../connection.js";
import { generateEmbeddings } from "./embeddingService.js";
import logger from "../logger.js";

/**
 * Retrieve the most relevant document chunks for a user's question using
 * pgvector cosine similarity search, with per-document windowing.
 *
 * The user's question is embedded with input_type "search_query" — the
 * retrieval-side counterpart to the "search_document" type used at storage
 * time. Using the correct type on each side is required for good retrieval.
 *
 * Strategy:
 *   - best_per_doc: finds each document's single closest chunk
 *   - top_docs: keeps only documents whose best chunk clears the threshold,
 *     capped at maxDocuments — prevents one document's phrasing from crowding
 *     out a genuinely relevant second warranty
 *   - ranked_chunks: gets a few chunks per surviving document, not pooled globally
 *
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID (scopes the search)
 * @param {string} params.question - The user's typed question
 * @param {number} [params.chunksPerDocument=3] - Chunks to return per document
 * @param {number} [params.maxDocuments=3] - Max documents to consider
 * @param {number} [params.similarityThreshold=0.3] - Min similarity to keep a document
 * @returns {Promise<Array<{id: number, document_id: number, original_filename: string, content: string, similarity: number}>>}
 */
async function searchDocumentChunks({
    userId,
    question,
    chunksPerDocument = 3,
    maxDocuments = 3,
    similarityThreshold = 0.3, // starting point — tune once you see real score distributions in logs
}) {
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

        const results = await prisma.$queryRaw`
            WITH best_per_doc AS (
                SELECT document_id, MIN(embedding <=> ${vectorString}::vector) AS best_distance
                FROM document_chunks
                WHERE user_id = ${uId}
                GROUP BY document_id
            ),
            top_docs AS (
                SELECT document_id
                FROM best_per_doc
                WHERE 1 - best_distance > ${similarityThreshold}
                ORDER BY best_distance ASC
                LIMIT ${maxDocuments}
            ),
            ranked_chunks AS (
                SELECT
                    dc.id, dc.document_id, dc.content,
                    1 - (dc.embedding <=> ${vectorString}::vector) AS similarity,
                    ROW_NUMBER() OVER (
                        PARTITION BY dc.document_id
                        ORDER BY dc.embedding <=> ${vectorString}::vector
                    ) AS rnk
                FROM document_chunks dc
                WHERE dc.document_id IN (SELECT document_id FROM top_docs)
            )
            SELECT rc.id, rc.document_id, rc.content, rc.similarity, d.original_filename
            FROM ranked_chunks rc
            JOIN documents d ON d.id = rc.document_id
            WHERE rc.rnk <= ${chunksPerDocument}
            ORDER BY rc.similarity DESC;
        `;

        const mapped = results.map((row) => ({
            id: Number(row.id),
            document_id: Number(row.document_id),
            original_filename: row.original_filename,
            content: row.content,
            similarity: Number(row.similarity),
        }));

        logger.debug(
            {
                userId: Number(uId),
                questionLength: question.length,
                resultCount: mapped.length,
                similarityThreshold,
                maxDocuments,
                chunksPerDocument,
            },
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