// src/utils/logger.ts
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty', // Optional: for readable console logs during development
    options: {
      singleLine: true,
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
    }
  }
});

export default logger;