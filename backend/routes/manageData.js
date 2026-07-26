import express from 'express';
import multer from 'multer';
import path from 'path';
import 'dotenv/config';
import { handleAddFile, handleRemoveFile, handleFetchAll, handleFetchOne } from '../controller/manageData.js';
import { addSseClient, removeSseClient } from '../config/sse.js'
const router = express.Router();

const isProduction = process.env.mode === 'production';

// Multer config: memory storage for production (Supabase), disk storage for dev
let upload;

if (isProduction) {
    // In production, keep file in memory so we can upload buffer to Supabase
    upload = multer({ storage: multer.memoryStorage() });
} else {
    // In development, store files locally in backend/uploads/
    const diskStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, path.join(import.meta.dirname, '..', 'uploads'));
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const ext = path.extname(file.originalname);
            cb(null, uniqueSuffix + ext);
        },
    });
    upload = multer({ storage: diskStorage });
}

router.get("/events", (req, res) => {
  const userId = req.user.id;

  // Required SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // Flush headers to establish connection immediately

  // Register this user's SSE connection
  addSseClient(userId, res);

  // Send periodic ping to keep the connection alive (prevents EC2/proxy timeouts)
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25000);

  // Clean up when the client closes the browser tab or disconnects
  req.on("close", () => {
    clearInterval(keepAlive);
    removeSseClient(userId);
    res.end();
  });
});

router.post('/upload', upload.single('file'), handleAddFile);
router.delete('/remove', handleRemoveFile);
router.get('/getAll', handleFetchAll);
router.get('/getOne/:documentId', handleFetchOne);

export default router;