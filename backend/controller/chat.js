import logger from "../logger.js";
import { chatWithDocuments } from "../services/chatService.js";

/**
 * POST /api/chat
 * Body: { question: string }
 *
 * Takes the user's question, runs the RAG pipeline (embed → search → LLM),
 * and returns the AI answer along with the source chunks used.
 */
async function handleChat(req, res) {
    try {
        const userId = req.user.id;
        const { question } = req.body;

        if (!question || typeof question !== "string" || question.trim().length === 0) {
            return res.status(400).json({ message: "Question is required" });
        }

        const { answer, sources } = await chatWithDocuments({
            userId,
            question: question.trim(),
        });
        
        return res.status(200).json({
            message: "Chat response generated",
            answer,
            sources,
        });
    } catch (error) {
        logger.error({ err: error }, "Chat error");
        return res.status(500).json({ message: "Failed to generate chat response" });
    }
}

export { handleChat };