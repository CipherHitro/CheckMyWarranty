import express from 'express';
import { handleLogin, handleSignUp, handleGetMe, handleLogout, handleForgetPassword, handleVerifyOtp, handleResetPassword, handleRefreshToken} from '../controller/user.js';
import { authenticateUser } from '../middlewares/auth.js';
const router = express.Router();

router.post('/signup', handleSignUp);
router.post('/login', handleLogin);
router.get('/me', authenticateUser, handleGetMe);
router.post('/logout', handleLogout);

router.post("/forgot-password", handleForgetPassword);
router.post("/verify-otp", handleVerifyOtp);
router.post("/reset-password", handleResetPassword);
router.post("/refresh", handleRefreshToken);
export default router;
