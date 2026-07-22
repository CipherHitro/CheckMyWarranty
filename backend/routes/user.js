import express from 'express';
import { handleLogin, handleSignUp, handleGetMe, handleLogout } from '../controller/user.js';
import { authenticateUser } from '../middlewares/auth.js';

const router = express.Router();

router.post('/signup', handleSignUp);
router.post('/login', handleLogin);
router.get('/me', authenticateUser, handleGetMe);
router.post('/logout', handleLogout);

export default router;