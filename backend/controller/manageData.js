const pool = require("../connection");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

// Helper: generate a random future expiry date (between 1-3 years from now)
function getRandomExpiryDate() {
    const now = new Date();
    const randomDays = Math.floor(Math.random() * 730) + 365; // 1-3 years
    now.setDate(now.getDate() + randomDays);
    return now.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function handleAddFile(req, res) {
    try {
        const userId = req.user.rows[0].id;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const originalFilename = req.file.originalname;
        const expiryDate = getRandomExpiryDate();

        const result = await pool.query(
            `INSERT INTO documents (user_id, file_url, original_filename, expiry_date)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, fileUrl, originalFilename, expiryDate]
        );

        return res.status(201).json({
            message: "File uploaded successfully",
            document: result.rows[0],
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

        // Delete the physical file from disk
        const filePath = path.join(__dirname, "..", doc.rows[0].file_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
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

        return res.status(200).json({
            message: "Documents fetched successfully",
            documents: result.rows,
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
