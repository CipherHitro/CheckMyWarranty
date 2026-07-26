import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import "dotenv/config";
import prisma from "./connection.js";
import logger from "./logger.js";
import pinoHttp from "pino-http";
import userRoute from "./routes/user.js";
import manageDataRoute from './routes/manageData.js';
import { authenticateUser } from './middlewares/auth.js';
import { testBrevoConnection } from "./services/brevoEmailService.js";
import { Queue } from "bullmq";
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'; // Use BullAdapter for legacy 'bull'
import { ExpressAdapter } from '@bull-board/express';
import { boardAuth } from "./middlewares/auth.js";

const app = express();
app.set("trust proxy", 1);
const port = 3000;

const isProduction = process.env.mode === "production";

// HTTP request logging
if (isProduction) {
  // Production: full verbose logging with request/response details
  app.use(pinoHttp({
    logger,
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization", "body.password", "body.token"],
      censor: "[REDACTED]",
    },
  }));
} else {
  // Development: one-line summary only — no req/res objects
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.url === "/health") return;
      const responseTime = Date.now() - start;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level]("%s %s %s %dms", req.method, req.url, res.statusCode, responseTime);
    });
    next();
  });
}

//Middlewares
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "https://checkmywarranty.vercel.app",
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));


// 1. Initialize your existing Bull/BullMQ Queues
const reminderQueue = new Queue('warranty-reminders', { connection: { host: 'redis', port: 6379 } });

// 2. Set up the Bull Board Express Adapter
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// 3. Create the Bull Board UI Instance
createBullBoard({
  queues: [
    new BullMQAdapter(reminderQueue),
  ],
  serverAdapter: serverAdapter,
});


app.use(express.json());
app.use(cookieParser());

// 4. Mount the Router Path on your Express app
app.use('/admin/queues', boardAuth,  serverAdapter.getRouter());
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(import.meta.dirname, 'uploads')));

// Routes
app.use("/api/user", userRoute);
app.use('/api/data', authenticateUser, manageDataRoute);

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "DB connected" });
  } catch (err) {
    logger.error({ err }, "Health check — database not connected");
    res.status(500).json({ status: "DB not connected", error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  logger.info({ port }, "Server started");
  logger.info("Reminder worker started — listening for email jobs");
  logger.info('Bull Board UI available at /admin/queues')
  testBrevoConnection();
});
