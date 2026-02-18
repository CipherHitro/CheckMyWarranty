const express = require('express');
const multer = require('multer');
const path = require('path');
const { handleAddFile, handleRemoveFile, handleFetchAll } = require('../controller/manageData');

const router = express.Router();

// Multer config: store files in backend/uploads/
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    },
});

const upload = multer({ storage });

router.post('/upload', upload.single('file'), handleAddFile);
router.delete('/remove', handleRemoveFile);
router.get('/getAll', handleFetchAll);

module.exports = router;