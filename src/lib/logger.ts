/**
 * Simple file-based logger for development/debugging
 * Writes logs to .log file at project root
 * Only works server-side (Node.js); client-side calls are no-ops
 */

const LOG_FILE = '.log';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}\n`;
}

async function appendToFile(formatted: string): Promise<void> {
  try {
    // Dynamic import to avoid bundling fs in client bundle
    if (typeof window === 'undefined') {
      // @ts-expect-error - dynamic import in server-only context
      const fs = await import('fs');
      // @ts-expect-error - dynamic import in server-only context
      const path = await import('path');
      const fullPath = path.join(process.cwd(), LOG_FILE);
      fs.appendFileSync(fullPath, formatted, 'utf8');
    }
  } catch (err) {
    // Silently fail if file system is not accessible
    console.error('Logger: Failed to write to log file', err);
  }
}

function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Write a log entry
 * On the server: appends to .log file and logs to console
 * On the client: logs to console only (no file access)
 */
export function log(
  level: LogLevel,
  module: string,
  message: string,
  data?: unknown,
): void {
  const formatted = formatMessage(level, module, message, data);

  if (isServer()) {
    // Fire and forget for file writing
    appendToFile(formatted).catch(() => {});
    // Also log to console based on level
    switch (level) {
      case 'error':
        console.error(formatted.trim());
        break;
      case 'warn':
        console.warn(formatted.trim());
        break;
      case 'debug':
        console.debug(formatted.trim());
        break;
      default:
        console.log(formatted.trim());
    }
  } else {
    // Client-side: only log to console
    switch (level) {
      case 'error':
        console.error(`[${level.toUpperCase()}] [${module}] ${message}`);
        break;
      case 'warn':
        console.warn(`[${level.toUpperCase()}] [${module}] ${message}`);
        break;
      case 'debug':
        console.debug(`[${level.toUpperCase()}] [${module}] ${message}`);
        break;
      default:
        console.log(`[${level.toUpperCase()}] [${module}] ${message}`);
    }
  }
}

// Convenience methods
export const logger = {
  info: (module: string, message: string, data?: unknown) => log('info', module, message, data),
  warn: (module: string, message: string, data?: unknown) => log('warn', module, message, data),
  error: (module: string, message: string, data?: unknown) => log('error', module, message, data),
  debug: (module: string, message: string, data?: unknown) => log('debug', module, message, data),
};
