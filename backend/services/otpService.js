import crypto from "crypto";
import { redisConnection } from "../config/redis.js";
const OTP_TTL_SECONDS = 300;        // 5 minutes
const RESET_TOKEN_TTL_SECONDS = 600; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

function otpKey(email) {
  return `otp:${email}`;
}
function attemptsKey(email) {
  return `otp-attempts:${email}`;
}
function resetTokenKey(token) {
  return `reset-token:${token}`;
}

export async function generateAndStoreOtp(email) {
  const otp = crypto.randomInt(100000, 999999).toString(); // 6-digit
  await redisConnection.set(otpKey(email), otp, "EX", OTP_TTL_SECONDS);
  await redisConnection.del(attemptsKey(email)); // Reset attempt counter for new OTP
  return otp;
}

export async function verifyOtp(email, submittedOtp) {
  const storedOtp = await redisConnection.get(otpKey(email));

  if (!storedOtp) {
    return {
      success: false,
      reason: "EXPIRED_OR_NOT_FOUND",
      message: "OTP has expired or is invalid. Please request a new OTP.",
      attemptsRemaining: 0
    };
  }

  // Increment attempts counter in Redis
  const attempts = await redisConnection.incr(attemptsKey(email));
  if (attempts === 1) {
    await redisConnection.expire(attemptsKey(email), OTP_TTL_SECONDS);
  }

  if (attempts > MAX_OTP_ATTEMPTS) {
    await redisConnection.del(otpKey(email));
    await redisConnection.del(attemptsKey(email));
    return {
      success: false,
      reason: "MAX_ATTEMPTS_EXCEEDED",
      message: `Maximum OTP verification attempts (${MAX_OTP_ATTEMPTS}) exceeded. Please request a new OTP.`,
      attemptsRemaining: 0
    };
  }

  if (storedOtp !== submittedOtp) {
    const remaining = MAX_OTP_ATTEMPTS - attempts;
    if (remaining <= 0) {
      // Reached max allowed attempts on this wrong OTP entry -> delete OTP from Redis immediately!
      await redisConnection.del(otpKey(email));
      await redisConnection.del(attemptsKey(email));
      return {
        success: false,
        reason: "MAX_ATTEMPTS_EXCEEDED",
        message: `Maximum OTP verification attempts (${MAX_OTP_ATTEMPTS}) exceeded. OTP has been invalidated. Please request a new OTP.`,
        attemptsRemaining: 0
      };
    }

    return {
      success: false,
      reason: "INVALID_OTP",
      message: `Invalid OTP. You have ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      attemptsRemaining: remaining
    };
  }

  // Successful verification: clean up OTP & attempts from Redis
  await redisConnection.del(otpKey(email));
  await redisConnection.del(attemptsKey(email));
  return {
    success: true
  };
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