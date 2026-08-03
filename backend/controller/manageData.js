import prisma from "../connection.js";
import path from "path";
import fs from "fs";
import os from "os";
import logger from "../logger.js";
import { uploadToS3, deleteFromS3, getSignedS3Url } from "../services/s3Storage.js";
import { redisConnection } from "../config/redis.js";
import { reminderQueue } from "../queues/reminderQueue.js";
import { documentQueue, addDocumentJob } from "../queues/documentQueue.js";
import "dotenv/config";

const isProduction = process.env.mode === "production";

async function handleAddFile(req, res) {
    try {
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        let fileUrl;
        let extractionFilePath;
        const originalFilename = req.file.originalname;

        if (isProduction) {
            // ── Production: upload to S3 ──
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const ext = path.extname(originalFilename);
            const storageName = uniqueSuffix + ext;

            fileUrl = await uploadToS3(
                req.file.buffer,
                storageName,
                req.file.mimetype
            );

            // Write buffer to a temp file for AI extraction
            extractionFilePath = path.join(os.tmpdir(), storageName);
            fs.writeFileSync(extractionFilePath, req.file.buffer);

            logger.debug({ storageName, userId: Number(userId) }, "File uploaded to S3");
        } else {
            // ── Development: file is already on disk via multer diskStorage ──
            fileUrl = `/uploads/${req.file.filename}`;
            extractionFilePath = path.join(import.meta.dirname, "..", fileUrl);

            logger.debug({ filename: req.file.filename, userId: Number(userId) }, "File saved locally");
        }

        // Step 1 — Insert with expiry_date = null
        const document = await prisma.documents.create({
            data: {
                user_id: userId,
                file_url: fileUrl,
                original_filename: originalFilename,
                expiry_date: null,
            },
        });

        logger.info({ documentId: Number(document.id), originalFilename }, "Document record created");

        // Step 2 — Queue the document for AI extraction & vector embeddings
        // The worker processes jobs one at a time (concurrency: 1) to avoid
        // flooding the Groq/Cohere APIs when multiple users upload simultaneously.
        // Convert BigInt IDs to Numbers — BullMQ uses JSON.stringify which
        // cannot serialize BigInt values
        await addDocumentJob({
            documentId: Number(document.id),
            userId: Number(userId),
            userEmail: req.user.email,
            originalFilename,
            filePath: extractionFilePath,
        });

        // Respond immediately (processing runs in the background via BullMQ)
        return res.status(201).json({
            message: "File uploaded successfully. Warranty details are being extracted.",
            document: {
                ...document,
                id: Number(document.id),
                user_id: Number(document.user_id),
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error uploading file");
        return res.status(500).json({ message: "Failed to upload file" });
    }
}

async function handleRemoveFile(req, res) {
    try {
        const userId = req.user.id;
        const { documentId } = req.body;

        if (!documentId) {
            return res.status(400).json({ message: "Document ID is required" });
        }

        // Fetch the document with its reminders (to cancel pending BullMQ jobs)
        const doc = await prisma.documents.findFirst({
            where: { id: BigInt(documentId), user_id: userId },
            include: { reminders: { select: { id: true } } },
        });

        if (!doc) {
            logger.warn({ documentId, userId: Number(userId) }, "Remove — document not found");
            return res.status(404).json({ message: "Document not found" });
        }

        const fileUrl = doc.file_url;

        if (isProduction) {
            // ── Production: delete from S3 ──
            await deleteFromS3(fileUrl);
            logger.debug({ documentId, fileUrl }, "File deleted from S3");
        } else {
            // ── Development: delete from local disk ──
            const filePath = path.join(import.meta.dirname, "..", fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            logger.debug({ documentId, fileUrl }, "File deleted from local disk");
        }

        // Cancel all pending BullMQ reminder jobs for this document
        if (doc.reminders && doc.reminders.length > 0) {
            for (const reminder of doc.reminders) {
                try {
                    await reminderQueue.remove(`reminder-${reminder.id}`);
                    logger.debug({ reminderId: Number(reminder.id) }, "Pending reminder job removed from queue");
                } catch (_) {
                    // Job may already be processed or not exist — ignore
                }
            }
        }

        // Cancel any pending document processing job
        try {
            await documentQueue.remove(`doc-${documentId}`);
            logger.debug({ documentId }, "Pending document processing job removed from queue");
        } catch (_) {
            // Job may already be processed or not exist — ignore
        }

        // Delete the record from the database (cascade deletes reminders)
        await prisma.documents.delete({
            where: { id: BigInt(documentId) },
        });
        await redisConnection.del(`signed-url:${documentId}`);

        logger.info({ documentId, userId: Number(userId) }, "Document removed");
        return res.status(200).json({ message: "File removed successfully" });
    } catch (error) {
        logger.error({ err: error, documentId: req.body.documentId }, "Error removing file");
        return res.status(500).json({ message: "Failed to remove file" });
    }
}

async function handleFetchAll(req, res) {
    try {
        const userId = req.user.id;

        const documents = await prisma.documents.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });

        // Convert BigInt fields for JSON serialization
        const mapped = documents.map((doc) => ({
            ...doc,
            id: Number(doc.id),
            user_id: Number(doc.user_id),
        }));

        logger.debug({ userId: Number(userId), count: mapped.length }, "Documents fetched");
        return res.status(200).json({
            message: "Documents fetched successfully",
            documents: mapped,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching documents");
        return res.status(500).json({ message: "Failed to fetch documents" });
    }
}

async function handleFetchOne(req, res) {
    try {
        const userId = req.user.id;
        const { documentId } = req.params;

        if (!documentId) {
            return res.status(400).json({ message: "Document ID is required" });
        }

        const doc = await prisma.documents.findFirst({
            where: { id: BigInt(documentId), user_id: userId },
        });

        if (!doc) {
            logger.warn({ documentId, userId: Number(userId) }, "FetchOne — document not found");
            return res.status(404).json({ message: "Document not found" });
        }

        let fileUrl = doc.file_url;

        // Only generate signed URL for S3-stored files in production
        if (isProduction && !fileUrl.startsWith("/uploads/")) {
            fileUrl = await getSignedS3Url(documentId, fileUrl, 900); // 10 minutes expiry
            logger.debug({ documentId }, "Signed URL generated for document");
        }

        return res.status(200).json({
            message: "Document fetched successfully",
            document: {
                ...doc,
                id: Number(doc.id),
                user_id: Number(doc.user_id),
                file_url: fileUrl,
            },
        });
    } catch (error) {
        logger.error({ err: error, documentId: req.params.documentId }, "Error fetching document");
        return res.status(500).json({ message: "Failed to fetch document" });
    }
}

export {
    handleAddFile,
    handleRemoveFile,
    handleFetchAll,
    handleFetchOne,
};