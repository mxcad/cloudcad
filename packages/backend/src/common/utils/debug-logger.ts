import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'debug' | 'log' | 'warn' | 'error';

@Injectable()
export class DebugLogger {
  private logLevelPriority: Record<LogLevel, number> = {
    debug: 0,
    log: 1,
    warn: 2,
    error: 3,
  };

  constructor(private configService: ConfigService) {}

  private shouldLog(module: string, level: LogLevel): boolean {
    const debugConfig = this.configService.get('debug');
    if (!debugConfig?.enabled) return false;

    const moduleLevel = (debugConfig.modules[module] || 'off') as LogLevel;
    if (moduleLevel === 'off') return false;

    return this.logLevelPriority[level] >= this.logLevelPriority[moduleLevel];
  }

  private formatMessage(module: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${module.toUpperCase()}] ${message}`;
  }

  private writeToFile(message: string): void {
    const debugConfig = this.configService.get('debug');
    if (!debugConfig?.filePath) return;

    try {
      const logDir = path.dirname(debugConfig.filePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(debugConfig.filePath, message + '\n');
    } catch (error) {
      console.error('写入调试日志失败:', error);
    }
  }

  private output(module: string, level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(module, level)) return;

    const formattedMessage = this.formatMessage(module, message);
    const debugConfig = this.configService.get('debug');

    // 控制台输出
    if (debugConfig?.console) {
      if (data) {
        console[level](formattedMessage, data);
      } else {
        console[level](formattedMessage);
      }
    }

    // 文件输出
    if (debugConfig?.filePath) {
      const logMessage = data ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage;
      this.writeToFile(logMessage);
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(module: string, message: string, data?: any): void {
    this.output(module, 'debug', message, data);
  }

  /**
   * INFO 级别日志
   */
  log(module: string, message: string, data?: any): void {
    this.output(module, 'log', message, data);
  }

  /**
   * WARN 级别日志
   */
  warn(module: string, message: string, data?: any): void {
    this.output(module, 'warn', message, data);
  }

  /**
   * ERROR 级别日志
   */
  error(module: string, message: string, data?: any): void {
    this.output(module, 'error', message, data);
  }

  /**
   * 性能计时器 - 开始
   */
  time(module: string, label: string): void {
    console.time(`${module.toUpperCase()}:${label}`);
  }

  /**
   * 性能计时器 - 结束
   */
  timeEnd(module: string, label: string): void {
    console.timeEnd(`${module.toUpperCase()}:${label}`);
  }

  /**
   * 打印请求日志
   */
  request(
    module: string,
    method: string,
    url: string,
    params?: any,
    body?: any,
  ): void {
    this.debug(module, `${method} ${url}`, { params, body });
  }

  /**
   * 打印响应日志
   */
  response(module: string, method: string, url: string, duration: number, result?: any): void {
    this.log(module, `${method} ${url} - ${duration}ms`, result);
  }
}

/**
 * 快速创建模块化日志的工厂函数
 */
export function createDebugLogger(moduleName: string, configService: ConfigService): DebugLogger {
  const logger = new DebugLogger(configService);
  return {
    debug: (msg: string, data?: any) => logger.debug(moduleName, msg, data),
    log: (msg: string, data?: any) => logger.log(moduleName, msg, data),
    warn: (msg: string, data?: any) => logger.warn(moduleName, msg, data),
    error: (msg: string, data?: any) => logger.error(moduleName, msg, data),
    time: (label: string) => logger.time(moduleName, label),
    timeEnd: (label: string) => logger.timeEnd(moduleName, label),
    request: (method: string, url: string, params?: any, body?: any) =>
      logger.request(moduleName, method, url, params, body),
    response: (method: string, url: string, duration: number, result?: any) =>
      logger.response(moduleName, method, url, duration, result),
  } as DebugLogger;
}
