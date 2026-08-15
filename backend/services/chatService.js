import Groq from "groq-sdk";
import logger from "../logger.js";
import "dotenv/config";
import { searchDocumentChunks } from "./searchService.js";

const groq = new Groq({ apiKey: process.env.GROQ_API });

const CHAT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

/**
 * Group retrieved chunks by document and build a labeled context block.
 * Each document is headed by its item name (original_filename).
 *
 * @param {Array<{document_id: number, original_filename: string, content: string}>} chunks
 * @returns {string}
 */
function buildContext(chunks) {
    const byDoc = {};
    for (const c of chunks) {
        if (!byDoc[c.document_id]) byDoc[c.document_id] = { item_name: c.original_filename, pieces: [] };
        byDoc[c.document_id].pieces.push(c.content);
    }
    return Object.values(byDoc)
        .map((doc) => `### ${doc.item_name}\n${doc.pieces.join("\n\n")}`)
        .join("\n\n");
}

/**
 * Run the full RAG pipeline for a user's question:
 *   1. Embed the query (search_query) and retrieve relevant chunks
 *   2. Send the question + retrieved context to Groq for an answer
 *
 * @param {Object} params
 * @param {number|BigInt} params.userId - User ID (scopes the search)
 * @param {string} params.question - The user's question
 * @returns {Promise<{answer: string, sources: Array<{id: number, document_id: number, original_filename: string, similarity: number, content: string}>}>}
 */
async function chatWithDocuments({ userId, question }) {
    // Step 1 — Retrieve relevant chunks via per-document windowed vector search
    const chunks = await searchDocumentChunks({ userId, question });

    if (chunks.length === 0) {
        logger.info({ userId: Number(userId) }, "No document chunks found for user — answering without context");

        return {
            answer: "I couldn't find any warranty documents in your account. Please upload a document first, then try asking again.",
            sources: [],
        };
    }

    // Step 2 — Build context grouped by item
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `You are a warranty assistant. Answer only using the retrieved context below, which comes from the user's own uploaded documents.

Today's date is ${today}.

Rules:
1. The context may include more than one item, each labeled with a heading like "### iPhone 15". If the question could apply to more than one item, answer for each relevant item separately and clearly labeled — never merge details from different items into one answer.
2. Base your answer only on the context below. Don't use outside knowledge about warranty policies in general. If the context doesn't clearly answer the question, say so honestly rather than guessing.
3. If the question involves dates (e.g. "is this still covered," "how many days are left"), calculate using today's date above.
4. Be concise — answer the question directly first, then add detail only if useful.
5. Never state a coverage decision more confidently than the source text supports. If the wording is ambiguous, say that it's ambiguous.

Retrieved context:
${buildContext(chunks)}`;

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
            original_filename: c.original_filename,
            similarity: c.similarity,
            content: c.content,
        })),
    };
}

export { chatWithDocuments };