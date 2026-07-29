import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production' || process.env.mode === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-loki',
    options: {
      // In local dev: http://127.0.0.1:3100 (or http://loki:3100 in docker)
      // In prod (Grafana Cloud): https://<your-loki-url>/loki/api/v1/push
      host: process.env.LOKI_HOST || 'http://127.0.0.1:3100',
      basicAuth: process.env.LOKI_AUTH_USER ? {
        username: process.env.LOKI_AUTH_USER,
        password: process.env.LOKI_AUTH_PASSWORD,
      } : undefined,
      labels: {
        app: 'checkmywarranty-app',
        env: process.env.mode || 'development',
      },
    },
  },
});

export default logger;