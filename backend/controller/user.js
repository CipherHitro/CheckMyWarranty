import prisma from "../connection.js";
import bcrypt from "bcryptjs";
import { setUser } from "../services/auth.js";
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

    // Convert BigInt id to Number for JSON serialization
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

    // Generate token — convert BigInt id to Number for JWT compatibility
    const token = setUser({ ...user, id: Number(user.id) });

    const isProd = process.env.mode === "production";
    // If behind a proxy (e.g. AWS ALB), trust the X-Forwarded-Proto header
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

    res.cookie("uid", token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isProd ? "none" : "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });

    logger.info({ email, userId: Number(user.id) }, "Login successful");
    return res.status(200).json({ message: "Logged in!" });
  } catch (error) {
    logger.error({ err: error }, "Login error");
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
  const isProd = process.env.mode === "production";
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.clearCookie("uid", {
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

    // Always return the same response whether or not the user exists —
    // otherwise this endpoint leaks which emails are registered.
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
    if (!result.success) {
      logger.warn({ email, reason: result.reason }, result.message);
      return res.status(400).json({
        error: result.message,
        reason: result.reason,
        attemptsRemaining: result.attemptsRemaining
      });
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
  handleResetPassword
};