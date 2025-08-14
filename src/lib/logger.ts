import { Logger, LogLevel, LogContext } from '../types/index.js';

class ConsoleLogger implements Logger {
  private shouldLog(level: LogLevel): boolean {
    const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[logLevel as LogLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(context && { context }),
    };
    return JSON.stringify(logEntry);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      process.stderr.write(this.formatMessage('debug', message, context) + '\n');
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      process.stderr.write(this.formatMessage('info', message, context) + '\n');
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      process.stderr.write(this.formatMessage('warn', message, context) + '\n');
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext = {
        ...context,
        ...(error && {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        }),
      };
      process.stderr.write(this.formatMessage('error', message, errorContext) + '\n');
    }
  }
}

export const logger = new ConsoleLogger();
