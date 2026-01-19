/**
 * 日志工具
 */
export class Logger {
  static info(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }

  static warn(message: string, ...args: any[]): void {}

  static success(message: string, ...args: any[]): void {}

  /**
   * 强制输出日志（仅在调试时启用）
   */
  static force(message: string, ...args: any[]): void {}

  /**
   * 静默所有日志输出
   */
  static setSilent(silent: boolean): void {
    // 可以在这里实现静默逻辑
  }
}

/**
 * 错误处理工具
 */
export class ErrorHandler {
  static handle(error: Error | unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error);

    // 静默处理错误，不输出日志
    // 可以在这里添加错误上报逻辑
    this.reportError(error, context);
  }

  static handleAsync(error: Error | unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error);

    // 静默处理异步错误，不输出日志
    // 可以在这里添加错误上报逻辑
    this.reportError(error, context);
  }

  private static reportError(error: Error | unknown, context: string): void {
    // 错误上报逻辑（可以集成 Sentry 或其他错误监控服务）
    // 目前静默处理
  }

  static createSafeAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context: string
  ) {
    return async (...args: T): Promise<R | null> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleAsync(error, context);
        return null;
      }
    };
  }
}

/**
 * 文件状态工具
 */
export class FileStatusHelper {
  private static statusTextMap = {
    UPLOADING: '正在上传',
    PROCESSING: '正在处理',
    COMPLETED: '已完成',
    FAILED: '处理失败',
    DELETED: '已删除',
  } as const;

  static getStatusText(status: string): string {
    return (
      this.statusTextMap[status as keyof typeof this.statusTextMap] || status
    );
  }

  static isCompleted(status?: string | null): boolean {
    return !status || status === 'COMPLETED';
  }

  static canOpen(status?: string | null): boolean {
    return this.isCompleted(status);
  }
}

/**
 * URL 工具
 */
export class UrlHelper {
  static getFileIdFromPath(pathname: string): string {
    const pathSegments = pathname.split('/');
    return pathSegments[pathSegments.length - 1] || '';
  }

  static buildMxCadFileUrl(fileHash: string, originalName?: string): string {
    // 根据原始文件扩展名动态构建 mxweb 文件名
    // 格式：{fileHash}.{原始扩展名}.mxweb
    let suffix = 'dwg'; // 默认扩展名

    if (originalName) {
      const lastDotIndex = originalName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        suffix = originalName.substring(lastDotIndex + 1).toLowerCase();
      }
    }

    return `/mxcad/file/${fileHash}.${suffix}.mxweb`;
  }
}

/**
 * 验证工具
 */
export class ValidationHelper {
  static isValidFileHash(hash?: string | null): boolean {
    return !!(hash && hash.length > 0);
  }

  static isValidNodeId(nodeId?: string | null): boolean {
    return !!(nodeId && nodeId.length > 0);
  }

  static isValidProjectContext(context: {
    projectId?: string;
    parentId?: string;
  }): boolean {
    return !!context.nodeId;
  }
}

/**
 * 延迟工具
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 重试工具
 */
export class RetryHelper {
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    context: string = '重试操作'
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (i === maxRetries) {
          throw error;
        }

        await delay(delayMs);
      }
    }

    throw lastError;
  }
}
