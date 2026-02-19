const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE;
const bucketName = process.env.SUPABASE_BUCKET;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upload a file buffer to Supabase Storage.
 * @param {Buffer} fileBuffer - The file content
 * @param {string} fileName - Unique filename to store under
 * @param {string} mimeType - MIME type of the file
 * @returns {string} The storage path (e.g. "documents/123456.pdf")
 */
async function uploadToSupabase(fileBuffer, fileName, mimeType) {
    const storagePath = `documents/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: false,
        });

    if (error) {
        throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return storagePath;
}

/**
 * Delete a file from Supabase Storage.
 * @param {string} storagePath - The path inside the bucket
 */
async function deleteFromSupabase(storagePath) {
    const { error } = await supabase.storage
        .from(bucketName)
        .remove([storagePath]);

    if (error) {
        throw new Error(`Supabase delete failed: ${error.message}`);
    }
}

/**
 * Generate a signed URL for a private file in Supabase Storage.
 * @param {string} storagePath - The path inside the bucket
 * @param {number} expiresIn - Seconds until URL expires (default 1 hour)
 * @returns {string} The signed URL
 */
async function getSignedUrl(storagePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, expiresIn);

    if (error) {
        throw new Error(`Supabase signed URL failed: ${error.message}`);
    }

    return data.signedUrl;
}

/**
 * Download a file from Supabase Storage as a Buffer.
 * @param {string} storagePath - The path inside the bucket
 * @returns {Buffer} The file content
 */
async function downloadFromSupabase(storagePath) {
    const { data, error } = await supabase.storage
        .from(bucketName)
        .download(storagePath);

    if (error) {
        throw new Error(`Supabase download failed: ${error.message}`);
    }

    // data is a Blob, convert to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

module.exports = {
    uploadToSupabase,
    deleteFromSupabase,
    getSignedUrl,
    downloadFromSupabase,
};
