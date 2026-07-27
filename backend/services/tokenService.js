import jwt from "jsonwebtoken";
import crypto from "crypto";
import { redisConnection } from "../config/redis.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(user) {
  return jwt.sign({ id: Number(user.id), email: user.email }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(user) {
  return jwt.sign({ id: Number(user.id) }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

export async function storeRefreshToken(userId, refreshToken) {
  await redisConnection.set(`refresh:${userId}`, hashToken(refreshToken), "EX", REFRESH_TOKEN_TTL_SECONDS);
}

export async function isRefreshTokenValid(userId, refreshToken) {
  const stored = await redisConnection.get(`refresh:${userId}`);
  return stored === hashToken(refreshToken);
}

export async function revokeRefreshToken(userId) {
  await redisConnection.del(`refresh:${userId}`);
}