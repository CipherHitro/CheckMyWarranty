const express = require('express')
const {  } = require('../controller/manageData')
const router = express.Router();

router.post('/upload', handleAddFile);
router.delete('/remove', handleRemoveFile);
router.get('/getAll', handleFetchAll)
module.exports = router