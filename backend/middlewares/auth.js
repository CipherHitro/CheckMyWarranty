import { getUser } from '../services/auth.js';
import prisma from '../connection.js';
import logger from '../logger.js';
import basicAuth from 'express-basic-auth';

async function authenticateUser(req, res, next) {
  try {
    // Get token from cookie
    const token = req.cookies?.accessToken;
    
    if (!token) {
      logger.warn("Auth — no Access token provided");
      return res.status(401).json({ message: "No authentication token provided" });
    }

    // Verify token
    const decoded = getUser(token);
    
    if (!decoded) {
      logger.warn("Auth — invalid or expired token");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Get full user details from database
    // Convert decoded.id (Number from JWT) to BigInt for Prisma query
    const user = await prisma.users.findUnique({
      where : {id : BigInt(decoded.id)}
    })
    if (!user) {
      logger.warn({ userId: decoded.id }, "Auth — user not found in database");
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user to request
    req.user = user;
    logger.debug({ userId: Number(user.id) }, "Auth — user authenticated");
    next();
  } catch (error) {
    logger.error({ err: error }, 'Authentication error');
    return res.status(500).json({ message: "Authentication failed" });
  }
}

const boardAuth = basicAuth({
  users: {
    admin: process.env.BULL_BOARD_PASSWORD || 'supersecretpassword',
  },
  challenge: true,
});
export { authenticateUser , boardAuth};