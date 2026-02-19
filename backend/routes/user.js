const express = require('express')
const { handleLogin, handleSignUp, handleGetMe, handleLogout } = require('../controller/user')
const { authenticateUser } = require('../middlewares/auth')
const router = express.Router();

router.post('/signup', handleSignUp);
router.post('/login', handleLogin);
router.get('/me', authenticateUser, handleGetMe);
router.post('/logout', handleLogout);

module.exports = router