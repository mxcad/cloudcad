/**
 * 统一日志工具
 * 替代 console.log，提供更好的日志管理和控制
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

class Logger {
  private isDevelopment = import.meta.env.MODE === 'development';
  private logLevel: LogLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  private logs: LogEntry[] = [];

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}] ` : '';
    return `${timestamp} [${level}] ${contextStr}${message}`;
  }

  private log(level: LogLevel, message: string, context?: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, context);

    // 存储日志
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
    });

    // 控制台输出
    switch (level) {
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(formattedMessage, data ?? '');
        }
        break;
      case LogLevel.INFO:
        console.info(formattedMessage, data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, data ?? '');
        break;
    }
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  error(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, context, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

// 导出单例
export const logger = new Logger();

// 导出便捷函数
export const debug = (message: string, context?: string, data?: unknown) =>
  logger.debug(message, context, data);

export const info = (message: string, context?: string, data?: unknown) =>
  logger.info(message, context, data);

export const warn = (message: string, context?: string, data?: unknown) =>
  logger.warn(message, context, data);

export const error = (message: string, context?: string, data?: unknown) =>
  logger.error(message, context, data);