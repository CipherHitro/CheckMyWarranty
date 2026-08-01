import Groq from "groq-sdk";
import logger from "../logger.js";
import "dotenv/config";
import { searchDocumentChunks } from "./searchService.js";

const groq = new Groq({ apiKey: process.env.GROQ_API });

const CHAT_MODEL = "llama-3.1-8b-instant";
const TOP_K = 5;

/**
 * Run the full RAG pipeline for a user's question:
 *   1. Embed the query (search_query) and retrieve relevant chunks
 *   2. Send the question + retrieved context to Groq for an answer
 *
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID (scopes the search)
 * @param {string} params.question - The user's question
 * @returns {Promise<{answer: string, sources: Array<{id: number, document_id: number, similarity: number, content: string}>}>}
 */
async function chatWithDocuments({ userId, question }) {
    // Step 1 — Retrieve relevant chunks via vector similarity search
    const chunks = await searchDocumentChunks({ userId, question, topK: TOP_K });

    if (chunks.length === 0) {
        logger.info({ userId: Number(userId) }, "No document chunks found for user — answering without context");

        return {
            answer: "I couldn't find any warranty documents in your account. Please upload a document first, then try asking again.",
            sources: [],
        };
    }

    // Step 2 — Build context from retrieved chunks
    const context = chunks
        .map((c, i) => `--- Context Chunk ${i + 1} (similarity: ${c.similarity.toFixed(4)}) ---\n${c.content}`)
        .join("\n\n");

    const systemPrompt = `You are a helpful assistant that answers questions about warranty documents.
Use the following retrieved context from the user's warranty documents to answer their question.
If the context doesn't contain enough information to answer, say so clearly.

Retrieved Context:
${context}`;

    // Step 3 — Generate answer with Groq
    const chat = await groq.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
        ],
        temperature: 0.3,
        max_tokens: 1024,
    });

    const answer = chat.choices[0]?.message?.content;

    if (!answer) {
        throw new Error("Groq returned an empty response");
    }

    logger.info(
        { userId: Number(userId), chunkCount: chunks.length, model: CHAT_MODEL },
        "RAG chat completed"
    );

    return {
        answer,
        sources: chunks.map((c) => ({
            id: c.id,
            document_id: c.document_id,
            similarity: c.similarity,
            content: c.content,
        })),
    };
}

export { chatWithDocuments };