import prisma from "../connection.js";
import bcrypt from "bcryptjs";
import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
} from "../services/tokenService.js";
import { getUser } from "../services/auth.js";
import jwt from "jsonwebtoken";
import { generateAndStoreOtp, verifyOtp, issueResetToken, consumeResetToken } from "../services/otpService.js";
import { sendOtpEmail } from "../services/brevoEmailService.js";
import logger from "../logger.js";
import 'dotenv/config';

async function handleSignUp(req, res) {
  try {
    const { email, password } = req.body;
    logger.debug({ email }, "Signup attempt");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      logger.warn({ email }, "Signup — email already exists");
      return res.status(409).json({ message: "Invalid Credential" });
    }

    // Hash the password
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(password, salt);

    // Insert the new user
    const newUser = await prisma.users.create({
      data: {
        email,
        password_hash: passHash
      },
      select: {
        id: true,
        email: true
      }
    });

    const userResponse = {
      id: Number(newUser.id),
      email: newUser.email
    };

    logger.info({ email, userId: userResponse.id }, "User registered successfully");
    return res.status(201).json({ message: "User registered successfully", user: userResponse });
  } catch (error) {
    logger.error({ err: error }, "Signup error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;
    logger.debug({ email }, "Login attempt");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if user exists
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      logger.warn({ email }, "Login — user not found");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = bcrypt.compareSync(password, user.password_hash);

    if (!isMatch) {
      logger.warn({ email }, "Login — incorrect password");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in Redis
    await storeRefreshToken(Number(user.id), refreshToken);

    const isProd = process.env.mode === "production";
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

    // Set cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info({ email, userId: Number(user.id) }, "Login successful");
    return res.status(200).json({ message: "Logged in!" });
  } catch (error) {
    logger.error({ err: error }, "Login error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleRefreshToken(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      logger.warn("Refresh — no refresh token provided");
      return res.status(401).json({ message: "No refresh token provided" });
    }

    // Verify the refresh token JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      logger.warn("Refresh — invalid or expired refresh token");
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Check if refresh token is valid in Redis
    const valid = await isRefreshTokenValid(decoded.id, refreshToken);
    if (!valid) {
      logger.warn({ userId: decoded.id }, "Refresh — token revoked or not found in Redis");
      return res.status(401).json({ message: "Refresh token revoked" });
    }

    // Fetch user
    const user = await prisma.users.findUnique({
      where: { id: BigInt(decoded.id) }
    });

    if (!user) {
      logger.warn({ userId: decoded.id }, "Refresh — user not found");
      return res.status(401).json({ message: "User not found" });
    }

    // Generate new tokens (rotate refresh token)
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Revoke old refresh token and store new one
    await revokeRefreshToken(Number(user.id));
    await storeRefreshToken(Number(user.id), newRefreshToken);

    const isProd = process.env.mode === "production";
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.debug({ userId: Number(user.id) }, "Tokens refreshed successfully");
    return res.status(200).json({ message: "Tokens refreshed" });
  } catch (error) {
    logger.error({ err: error }, "Refresh token error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleGetMe(req, res) {
  try {
    const user = req.user;
    if (!user) {
      logger.warn("GetMe — no user in request");
      return res.status(401).json({ message: "User not found" });
    }

    const { id, email, name } = user;
    logger.debug({ userId: Number(id), email }, "GetMe — user fetched");
    return res.status(200).json({
      user: {
        id: Number(id),
        email,
        name: name || email.split("@")[0]
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Get me error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

function handleLogout(req, res) {
  // Try to get userId from the refresh token cookie (logout is not behind auth middleware)
  const refreshToken = req.cookies?.refreshToken;
  let userId = null;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      userId = decoded.id;
      revokeRefreshToken(userId).catch(() => {});
    } catch {
      // Token invalid or expired — just clear cookies
    }
  }

  const isProd = process.env.mode === "production";
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: isSecure,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isSecure,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  logger.info("User logged out");
  return res.status(200).json({ message: "Logged out successfully" });
}

async function handleForgetPassword(req, res) {
  try {
    const { email } = req.body;
    logger.debug({ email }, "Forgot password request");

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.users.findUnique({ where: { email } });

    if (user) {
      const otp = await generateAndStoreOtp(email);
      await sendOtpEmail(email, otp);
      logger.info({ email }, "OTP sent for password reset");
    } else {
      logger.warn({ email }, "Forgot password — email not found (response hidden)");
    }

    res.json({ message: "If that email exists, an OTP has been sent." });
  } catch (error) {
    logger.error({ err: error }, "Forgot password error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleVerifyOtp(req, res) {
  try {
    const { email, otp } = req.body;
    logger.debug({ email }, "OTP verification attempt");

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const result = await verifyOtp(email, otp);
    if (!result) {
      logger.warn({ email }, "Invalid or expired OTP");
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const resetToken = await issueResetToken(email);
    logger.info({ email }, "OTP verified — reset token issued");
    res.json({ resetToken });
  } catch (error) {
    logger.error({ err: error }, "OTP verification error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleResetPassword(req, res) {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const email = await consumeResetToken(resetToken);
    if (!email) {
      logger.warn("Reset password — invalid or expired token");
      return res.status(400).json({ error: "Invalid or expired reset session" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashed = bcrypt.hashSync(newPassword, salt);

    await prisma.users.update({
      where: { email },
      data: { password_hash: hashed },
    });

    logger.info({ email }, "Password reset successfully");
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error({ err: error }, "Reset password error");
    return res.status(500).json({ message: "Internal server error" });
  }
}

export {
  handleLogin,
  handleSignUp,
  handleGetMe,
  handleLogout,
  handleForgetPassword,
  handleVerifyOtp,
  handleResetPassword,
  handleRefreshToken,
};