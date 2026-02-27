import { StoragePathConstants } from '../constants/storage.constants';
import { ValidationHelper as StorageValidationHelper } from '../constants/storage.constants';

// 重新导出 logger.ts 中的统一日志工具
export { logger as Logger, logger, LogLevel } from './logger';

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

  static createSafeAsync<T extends unknown[], R>(
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
  // 存储路径常量
  private static readonly STORAGE_PATH_PREFIX = 'filesData/';
  private static readonly MXWEB_EXTENSION = '.mxweb';

  static getFileIdFromPath(pathname: string): string {
    const pathSegments = pathname.split('/');
    return pathSegments[pathSegments.length - 1] || '';
  }

  /**
   * 构建 MxCAD 文件访问 URL
   * @param nodePath 节点路径（格式：YYYYMM/nodeId/file.dwg.mxweb 或 filesData/YYYYMM/nodeId/file.dwg.mxweb）
   * @returns MxCAD 文件访问 URL（格式：/mxcad/filesData/YYYYMM/nodeId/file.dwg.mxweb）
   */
  static buildMxCadFileUrl(nodePath: string): string {
    // 如果路径不以 filesData/ 开头，自动添加
    if (!nodePath.startsWith(StoragePathConstants.STORAGE_PATH_PREFIX + '/')) {
      nodePath = `${StoragePathConstants.STORAGE_PATH_PREFIX}/${nodePath}`;
    }

    // 验证路径格式，防止路径遍历攻击
    if (!StorageValidationHelper.isValidNodePath(nodePath)) {
      Logger.error('无效的节点路径格式', { nodePath });
      throw new Error('无效的节点路径格式');
    }

    // 使用常量拼接路径
    return `${StoragePathConstants.MXWEB_ACCESS_PREFIX}${nodePath}`;
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
