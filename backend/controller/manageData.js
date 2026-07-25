import prisma from "../connection.js";
import path from "path";
import fs from "fs";
import os from "os";
import { extractWarrantyDetails } from "../services/extractWarranty.js";
import { uploadToS3, deleteFromS3, getSignedS3Url } from "../services/s3Storage.js";
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
        } else {
            // ── Development: file is already on disk via multer diskStorage ──
            fileUrl = `/uploads/${req.file.filename}`;
            extractionFilePath = path.join(import.meta.dirname, "..", fileUrl);
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

        // Step 2 — Kick off AI extraction in the background
        extractWarrantyDetails(extractionFilePath, originalFilename)
            .then(async (extracted) => {
                // Clean up temp file in production
                if (isProduction) {
                    try { fs.unlinkSync(extractionFilePath); } catch (_) {}
                }

                if (extracted && extracted.expiry_date) {
                    await prisma.documents.update({
                        where: { id: document.id },
                        data: { expiry_date: extracted.expiry_date },
                    });
                    console.log(
                        `[extract] Document ${document.id}: expiry_date updated to ${extracted.expiry_date}`
                    );

                    // ── Create reminder in the DB ──
                    try {
                        const now = new Date();
                        const expiryDate = new Date(extracted.expiry_date);

                        if (expiryDate <= now) {
                            console.log(
                                `[reminder] Document ${document.id}: expiry already passed — skipping reminder`
                            );
                        } else {
                            const msPerDay = 24 * 60 * 60 * 1000;
                            const daysRemaining = Math.ceil((expiryDate - now) / msPerDay);

                            let remindAt;
                            if (daysRemaining >= 7) {
                                remindAt = new Date(expiryDate);
                                remindAt.setDate(remindAt.getDate() - 7);
                            } else if (daysRemaining >= 3) {
                                remindAt = new Date(expiryDate);
                                remindAt.setDate(remindAt.getDate() - 3);
                            } else {
                                remindAt = now;
                            }

                            await prisma.reminders.create({
                                data: {
                                    user_id: userId,
                                    document_id: document.id,
                                    remind_at: remindAt,
                                },
                            });
                            console.log(
                                `[reminder] Document ${document.id}: reminder created for ${remindAt.toISOString()} (${daysRemaining} days until expiry)`
                            );
                        }
                    } catch (reminderErr) {
                        console.error(
                            `[reminder] Document ${document.id}: failed to create reminder —`,
                            reminderErr.message
                        );
                    }
                } else {
                    console.log(
                        `[extract] Document ${document.id}: could not extract expiry date`
                    );
                }
            })
            .catch((err) => {
                // Clean up temp file in production on error too
                if (isProduction) {
                    try { fs.unlinkSync(extractionFilePath); } catch (_) {}
                }
                console.error(`[extract] Document ${document.id}: extraction error —`, err.message);
            });

        // Respond immediately (extraction runs in background)
        return res.status(201).json({
            message: "File uploaded successfully. Warranty details are being extracted.",
            document: {
                ...document,
                id: Number(document.id),
                user_id: Number(document.user_id),
            },
        });
    } catch (error) {
        console.error("Error uploading file:", error);
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

        // Fetch the document to get the file path (and verify ownership)
        const doc = await prisma.documents.findFirst({
            where: { id: BigInt(documentId), user_id: userId },
        });

        if (!doc) {
            return res.status(404).json({ message: "Document not found" });
        }

        const fileUrl = doc.file_url;

        if (isProduction) {
            // ── Production: delete from S3 ──
            await deleteFromS3(fileUrl);
        } else {
            // ── Development: delete from local disk ──
            const filePath = path.join(import.meta.dirname, "..", fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Delete the record from the database
        await prisma.documents.delete({
            where: { id: BigInt(documentId) },
        });

        return res.status(200).json({ message: "File removed successfully" });
    } catch (error) {
        console.error("Error removing file:", error);
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

        return res.status(200).json({
            message: "Documents fetched successfully",
            documents: mapped,
        });
    } catch (error) {
        console.error("Error fetching documents:", error);
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
            return res.status(404).json({ message: "Document not found" });
        }

        let fileUrl = doc.file_url;

        // Only generate signed URL for S3-stored files in production
        if (isProduction && !fileUrl.startsWith("/uploads/")) {
            fileUrl = await getSignedS3Url(fileUrl, 600); // 10 minutes expiry
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
        console.error("Error fetching document:", error);
        return res.status(500).json({ message: "Failed to fetch document" });
    }
}

export {
    handleAddFile,
    handleRemoveFile,
    handleFetchAll,
    handleFetchOne,
};
