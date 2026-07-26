import crypto from "crypto";
import { redisConnection } from "../config/redis.js";
const OTP_TTL_SECONDS = 300;        // 5 minutes
const RESET_TOKEN_TTL_SECONDS = 600; // 10 minutes

function otpKey(email) {
  return `otp:${email}`;
}
function resetTokenKey(token) {
  return `reset-token:${token}`;
}

export async function generateAndStoreOtp(email) {
  const otp = crypto.randomInt(100000, 999999).toString(); // 6-digit
  await redisConnection.set(otpKey(email), otp, "EX", OTP_TTL_SECONDS);
  return otp;
}

export async function verifyOtp(email, submittedOtp) {
  const storedOtp = await redisConnection.get(otpKey(email));
  if (!storedOtp || storedOtp !== submittedOtp) {
    return false;
  }
  await redisConnection.del(otpKey(email)); // single-use
  return true;
}

export async function issueResetToken(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await redisConnection.set(resetTokenKey(token), email, "EX", RESET_TOKEN_TTL_SECONDS);
  return token;
}

export async function consumeResetToken(token) {
  const email = await redisConnection.get(resetTokenKey(token));
  if (!email) return null;
  await redisConnection.del(resetTokenKey(token)); // single-use
  return email;
}