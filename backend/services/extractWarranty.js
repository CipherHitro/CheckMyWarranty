const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({ apiKey: process.env.GROQ_API });

// ── Minimum characters to consider a PDF "text-based" ───────────
const MIN_TEXT_LENGTH = 80;

// ── Helper: extract text from PDF using pdf-parse v2 ────────────
async function extractPdfText(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    return (result.text || "").trim();
}

// ── Shared prompt ───────────────────────────────────────────────
const EXTRACTION_PROMPT = `You are a warranty document data extractor.
Analyse the provided document content and extract the following fields:
- purchase_date   (the date the item was purchased)
- item_name       (the product / item name)
- expiry_date     (warranty expiration date)

Rules:
1. If the expiration date is expressed as a duration (e.g. "1 year", "24 months"),
   calculate the exact calendar date by adding the duration to the purchase date.
2. All dates MUST be in ISO format: YYYY-MM-DD.
3. If a field cannot be determined, set its value to null.
4. Return ONLY a valid JSON object with exactly these three keys — no markdown,
   no explanation, no extra text.

Example output:
{"purchase_date":"2024-06-15","item_name":"Samsung Galaxy S24","expiry_date":"2026-06-15"}`;

// ─────────────────────────────────────────────────────────────────
//  1. Text-based PDF  →  llama-3.1-8b-instant (text only)
// ─────────────────────────────────────────────────────────────────
async function extractFromText(text) {
    const chat = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            {
                role: "user",
                content: `Here is the text extracted from a warranty document:\n\n${text}`,
            },
        ],
        temperature: 0.1,
        max_tokens: 512,
    });

    return parseLLMResponse(chat.choices[0]?.message?.content);
}

// ─────────────────────────────────────────────────────────────────
//  2. Scanned PDF  →  convert to image, then use vision model
// ─────────────────────────────────────────────────────────────────
async function extractFromScannedPDF(filePath) {
    // Convert first page of PDF to a PNG screenshot via pdf-parse v2
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const screenshots = await parser.getScreenshot({
        first: 1,
        scale: 2,
        imageBuffer: true,
        imageDataUrl: true,
    });

    if (!screenshots.pages.length || !screenshots.pages[0].dataUrl) {
        console.error("[extract] Could not render PDF page to image");
        return null;
    }

    const dataUrl = screenshots.pages[0].dataUrl;

    const chat = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "This is a screenshot of a scanned warranty / invoice document. Please extract the required fields.",
                    },
                    {
                        type: "image_url",
                        image_url: { url: dataUrl },
                    },
                ],
            },
        ],
        temperature: 0.1,
        max_tokens: 512,
    });

    return parseLLMResponse(chat.choices[0]?.message?.content);
}

// ─────────────────────────────────────────────────────────────────
//  3. Image  →  llama-4-scout (vision)
// ─────────────────────────────────────────────────────────────────
async function extractFromImage(filePath, mimeType) {
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64File}`;

    const chat = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "This is a photo / screenshot of a warranty document or invoice. Please extract the required fields.",
                    },
                    {
                        type: "image_url",
                        image_url: { url: dataUrl },
                    },
                ],
            },
        ],
        temperature: 0.1,
        max_tokens: 512,
    });

    return parseLLMResponse(chat.choices[0]?.message?.content);
}

// ─────────────────────────────────────────────────────────────────
//  Parse the JSON that the LLM returns
// ─────────────────────────────────────────────────────────────────
function parseLLMResponse(raw) {
    if (!raw) return null;

    try {
        // Strip possible markdown code-fences
        let cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        const parsed = JSON.parse(cleaned);
        return {
            purchase_date: parsed.purchase_date || null,
            item_name: parsed.item_name || null,
            expiry_date: parsed.expiry_date || null,
        };
    } catch (err) {
        console.error("Failed to parse LLM response:", raw, err.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────
//  Main entry: decide route based on file type
// ─────────────────────────────────────────────────────────────────
async function extractWarrantyDetails(filePath, originalFilename) {
    const ext = path.extname(originalFilename).toLowerCase();
    const isPDF = ext === ".pdf";
    const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    const isImg = imageExts.includes(ext);

    try {
        if (isPDF) {
            // Step 1 — try text extraction via pdf-parse v2
            const text = await extractPdfText(filePath);

            if (text.length >= MIN_TEXT_LENGTH) {
                console.log(`[extract] PDF has ${text.length} chars — using text model`);
                return await extractFromText(text);
            } else {
                console.log(`[extract] PDF text too short (${text.length} chars) — using vision model for scanned PDF`);
                return await extractFromScannedPDF(filePath);
            }
        } else if (isImg) {
            const mimeMap = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".gif": "image/gif",
            };
            console.log("[extract] Image file — using vision model");
            return await extractFromImage(filePath, mimeMap[ext] || "image/jpeg");
        } else {
            console.log("[extract] Unsupported file type for extraction:", ext);
            return null;
        }
    } catch (err) {
        console.error("[extract] Extraction failed:", err.message);
        return null;
    }
}

module.exports = { extractWarrantyDetails };
