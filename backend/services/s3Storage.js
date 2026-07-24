import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import "dotenv/config";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const bucketName = process.env.AWS_S3_BUCKET;

/**
 * Upload a file buffer to S3.
 * @param {Buffer} fileBuffer - The file content
 * @param {string} fileName - Unique filename to store under
 * @param {string} mimeType - MIME type of the file
 * @returns {string} The S3 object key (e.g. "documents/123456.pdf")
 */
async function uploadToS3(fileBuffer, fileName, mimeType) {
  const key = `documents/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  return key;
}

/**
 * Delete a file from S3.
 * @param {string} key - The S3 object key inside the bucket
 */
async function deleteFromS3(key) {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Generate a signed URL for private S3 objects.
 * @param {string} key - The S3 object key
 * @param {number} expiresIn - Seconds until URL expires (default 1 hour)
 * @returns {string} The signed URL
 */
async function getSignedS3Url(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return url;
}

export { uploadToS3, deleteFromS3, getSignedS3Url };