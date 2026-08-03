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
import chatRoute from './routes/chat.js';
import { authenticateUser, boardAuth } from './middlewares/auth.js';
import { testBrevoConnection } from "./services/brevoEmailService.js";
import { reminderQueue } from './queues/reminderQueue.js';
import { documentQueue } from './queues/documentQueue.js';
import "./workers/reminderWorker.js"; // starts the worker as a side-effect
import "./workers/documentWorker.js"; // starts the document processing worker
import { recoverPendingJobs } from './services/jobRecoveryService.js';
import { shouldIgnoreRequest } from './utils/logFilter.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const app = express();
app.set("trust proxy", 1);
const port = 3000;

const isProduction = process.env.mode === "production";

// HTTP request logging
if (isProduction) {
  app.use(pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => shouldIgnoreRequest(req.url),
    },
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization", "body.password", "body.token"],
      censor: "[REDACTED]",
    },
  }));
} else {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (shouldIgnoreRequest(req.url)) return;
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

app.use(express.json());
app.use(cookieParser());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(import.meta.dirname, 'uploads')));

// Bull Board UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(reminderQueue), new BullMQAdapter(documentQueue)],
  serverAdapter,
});
app.use('/admin/queues', boardAuth, serverAdapter.getRouter());

// Routes
app.use("/api/user", userRoute);
app.use('/api/data', authenticateUser, manageDataRoute);
app.use('/api/chat', authenticateUser, chatRoute);

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
  logger.info("Document worker started — processing extraction & embedding jobs one at a time");
  logger.info('Bull Board UI available at /admin/queues');
  testBrevoConnection();

  // Recover any pending reminders that were lost when Redis went down
  recoverPendingJobs();
});
