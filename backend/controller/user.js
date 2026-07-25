import prisma from "../connection.js";
import bcrypt from "bcryptjs";
import { setUser } from "../services/auth.js";
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

export {
  handleLogin,
  handleSignUp,
  handleGetMe,
  handleLogout,
};