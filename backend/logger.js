import pino from "pino";

const isProduction = process.env.mode === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // In development, use pino-pretty to make logs human-readable in terminal
  transport: !isProduction
    ? {
        target: "pino-pretty",
        options: { colorize: true },
      }
    : undefined,
});

export default logger;