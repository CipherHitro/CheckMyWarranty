import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redisConnection } from '../config/redis.js';
// 1. Strict Limiter for Auth endpoints (Login / Password Reset)
export const authRateLimiter = new RateLimiterRedis({
  storeClient: redisConnection,
  keyPrefix: 'auth_rl',
  points: 5, // Allow max 5 failed attempts
  duration: 15 * 60, // Per 15 minutes (in seconds)
  blockDuration: 15 * 60, // Block for 15 minutes if limit is exceeded
});

// Middleware for auth routes
export const authRateLimiterMiddleware = async (req, res, next) => {
  // Combine IP and username/email if available to prevent single-account targeting
  const email = req.body.email || '';
  const key = email ? `${req.ip}_${email}` : req.ip;

  try {
    // Check if key is blocked/consumed
    await authRateLimiter.consume(key);
    next();
  } catch (rejRes) {
    // If rate limit exceeded
    const retrySecs = Math.round(rejRes.msBeforeNext / 1000) || 60;
    
    res.set('Retry-After', String(retrySecs));
    return res.status(429).json({
      success: false,
      message: `Too many failed login attempts. Please try again in ${Math.ceil(retrySecs / 60)} minutes.`,
    });
  }
};