import express from 'express';
import multer from 'multer';
import path from 'path';
import 'dotenv/config';
import { handleAddFile, handleRemoveFile, handleFetchAll } from '../controller/manageData.js';

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

router.post('/upload', upload.single('file'), handleAddFile);
router.delete('/remove', handleRemoveFile);
router.get('/getAll', handleFetchAll);

export default router;