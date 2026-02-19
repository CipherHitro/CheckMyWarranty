const pool = require("../connection");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { extractWarrantyDetails } = require("../services/extractWarranty");
const {
    uploadToSupabase,
    deleteFromSupabase,
    getSignedUrl,
    downloadFromSupabase,
} = require("../services/supabaseStorage");
require("dotenv").config();

const isProduction = process.env.mode === "production";

async function handleAddFile(req, res) {
    try {
        const userId = req.user.rows[0].id;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        let fileUrl;
        let extractionFilePath;
        const originalFilename = req.file.originalname;

        if (isProduction) {
            // ── Production: upload to Supabase Storage ──
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const ext = path.extname(originalFilename);
            const storageName = uniqueSuffix + ext;

            fileUrl = await uploadToSupabase(
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
            extractionFilePath = path.join(__dirname, "..", fileUrl);
        }

        // Step 1 — Insert with expiry_date = null
        const result = await pool.query(
            `INSERT INTO documents (user_id, file_url, original_filename, expiry_date)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, fileUrl, originalFilename, null]
        );

        const document = result.rows[0];

        // Step 2 — Kick off AI extraction in the background
        extractWarrantyDetails(extractionFilePath, originalFilename)
            .then(async (extracted) => {
                // Clean up temp file in production
                if (isProduction) {
                    try { fs.unlinkSync(extractionFilePath); } catch (_) {}
                }

                if (extracted && extracted.expiry_date) {
                    await pool.query(
                        "UPDATE documents SET expiry_date = $1 WHERE id = $2",
                        [extracted.expiry_date, document.id]
                    );
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

                            await pool.query(
                                `INSERT INTO reminders (user_id, document_id, remind_at)
                                 VALUES ($1, $2, $3)`,
                                [userId, document.id, remindAt]
                            );
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
            document,
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        return res.status(500).json({ message: "Failed to upload file" });
    }
}

async function handleRemoveFile(req, res) {
    try {
        const userId = req.user.rows[0].id;
        const { documentId } = req.body;

        if (!documentId) {
            return res.status(400).json({ message: "Document ID is required" });
        }

        // Fetch the document to get the file path (and verify ownership)
        const doc = await pool.query(
            "SELECT * FROM documents WHERE id = $1 AND user_id = $2",
            [documentId, userId]
        );

        if (doc.rows.length === 0) {
            return res.status(404).json({ message: "Document not found" });
        }

        const fileUrl = doc.rows[0].file_url;

        if (fileUrl.startsWith("/uploads/")) {
            // Old local file — delete from disk regardless of mode
            const filePath = path.join(__dirname, "..", fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } else if (isProduction) {
            // ── Production: delete from Supabase Storage ──
            await deleteFromSupabase(fileUrl);
        } else {
            // ── Development: delete from local disk ──
            const filePath = path.join(__dirname, "..", fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Delete the record from the database
        await pool.query(
            "DELETE FROM documents WHERE id = $1 AND user_id = $2",
            [documentId, userId]
        );

        return res.status(200).json({ message: "File removed successfully" });
    } catch (error) {
        console.error("Error removing file:", error);
        return res.status(500).json({ message: "Failed to remove file" });
    }
}

async function handleFetchAll(req, res) {
    try {
        const userId = req.user.rows[0].id;

        const result = await pool.query(
            "SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );

        let documents = result.rows;

        if (isProduction) {
            // ── Production: generate signed URLs for Supabase-stored documents ──
            documents = await Promise.all(
                documents.map(async (doc) => {
                    // Skip old documents that were stored locally before Supabase migration
                    if (doc.file_url.startsWith("/uploads/")) {
                        return doc;
                    }
                    try {
                        const signedUrl = await getSignedUrl(doc.file_url, 3600);
                        return { ...doc, file_url: signedUrl };
                    } catch (err) {
                        console.error(
                            `[storage] Failed to generate signed URL for doc ${doc.id}:`,
                            err.message
                        );
                        return doc;
                    }
                })
            );
        }

        return res.status(200).json({
            message: "Documents fetched successfully",
            documents,
        });
    } catch (error) {
        console.error("Error fetching documents:", error);
        return res.status(500).json({ message: "Failed to fetch documents" });
    }
}

module.exports = {
    handleAddFile,
    handleRemoveFile,
    handleFetchAll,
}
