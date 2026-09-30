export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const SENSITIVE_KEY = /token|authorization|secret|password|api[-_]?key/i;

function redact(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : value,
    ])
  );
}

/**
 * JSON-lines logger. Writes to stderr by default: stdout is reserved for MCP JSON-RPC.
 */
export function createLogger(
  level: LogLevel,
  write: (line: string) => void = line => {
    process.stderr.write(line);
  }
): Logger {
  const threshold = LOG_LEVELS.indexOf(level);
  const log = (at: LogLevel, message: string, fields: LogFields = {}): void => {
    if (LOG_LEVELS.indexOf(at) < threshold) return;
    const entry = { time: new Date().toISOString(), level: at, msg: message, ...redact(fields) };
    write(`${JSON.stringify(entry)}\n`);
  };
  return {
    debug: (message, fields) => {
      log('debug', message, fields);
    },
    info: (message, fields) => {
      log('info', message, fields);
    },
    warn: (message, fields) => {
      log('warn', message, fields);
    },
    error: (message, fields) => {
      log('error', message, fields);
    },
  };
}
