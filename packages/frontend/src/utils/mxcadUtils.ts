///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { StoragePathConstants } from '../constants/storage.constants';
import { ValidationHelper as StorageValidationHelper } from '../constants/storage.constants';
import { t } from '@/languages';

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
  private static get statusTextMap() {
    return {
      UPLOADING: t('正在上传'),
      PROCESSING: t('正在处理'),
      COMPLETED: t('已完成'),
      FAILED: t('处理失败'),
      DELETED: t('已删除'),
    } as const;
  }

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
  // 公开文件（游客/未登录场景）访问前缀
  private static readonly PUBLIC_FILE_ACCESS_PREFIX =
    '/api/v1/public-file/access/';

  static getFileIdFromPath(pathname: string): string {
    const pathSegments = pathname.split('/');
    return pathSegments[pathSegments.length - 1] || '';
  }

  /**
   * 构建 mxweb 文件访问 URL（唯一出口）
   *
   * 协议格式：
   * - 项目/个人空间：/api/v1/mxcad/filesData/{nodePath}
   * - 图纸库/图块库：/api/v1/library/{libraryKey}/filesData/{nodePath}
   * 查询参数按 version → t（缓存时间戳）→ shareToken 顺序拼接。
   *
   * @param opts.nodePath 节点路径（格式：YYYYMM/nodeId/file.dwg.mxweb，缺 filesData/ 前缀时自动补齐）
   */
  static buildMxwebFileUrl(opts: {
    nodePath: string;
    libraryKey?: 'drawing' | 'block';
    version?: string;
    cacheTimestamp?: number;
    shareToken?: string;
  }): string {
    let nodePath = opts.nodePath;
    // 如果路径不以 filesData/ 开头，自动添加
    if (!nodePath.startsWith(StoragePathConstants.STORAGE_PATH_PREFIX + '/')) {
      nodePath = `${StoragePathConstants.STORAGE_PATH_PREFIX}/${nodePath}`;
    }

    const prefix = opts.libraryKey
      ? `${StoragePathConstants.LIBRARY_ACCESS_PREFIX}${opts.libraryKey}/`
      : StoragePathConstants.MXWEB_ACCESS_PREFIX;
    let url = `${prefix}${nodePath}`;

    const params: string[] = [];
    if (opts.version !== undefined) params.push(`v=${opts.version}`);
    if (opts.cacheTimestamp !== undefined)
      params.push(`t=${opts.cacheTimestamp}`);
    if (opts.shareToken) params.push(`shareToken=${opts.shareToken}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return url;
  }

  /**
   * 从 mxweb 文件访问 URL 中提取节点路径（buildMxwebFileUrl 的逆操作）
   * @returns 形如 YYYYMM/nodeId/file.dwg.mxweb 的路径；非 mxweb 访问 URL（如公共分享）返回 null
   */
  static extractMxwebFilePath(url: string): string | null {
    const match = url.match(
      /\/api\/v1\/(?:mxcad|library\/(?:drawing|block))\/filesData\/([^?]+)/
    );
    return match?.[1] ?? null;
  }

  /**
   * 构建 MxCAD 文件访问 URL（带路径校验）
   * @param nodePath 节点路径（格式：YYYYMM/nodeId/file.dwg.mxweb 或 filesData/YYYYMM/nodeId/file.dwg.mxweb）
   * @returns MxCAD 文件访问 URL（格式：/api/v1/mxcad/filesData/YYYYMM/nodeId/file.dwg.mxweb）
   */
  static buildMxCadFileUrl(nodePath: string): string {
    // 如果路径不以 filesData/ 开头，自动添加
    if (!nodePath.startsWith(StoragePathConstants.STORAGE_PATH_PREFIX + '/')) {
      nodePath = `${StoragePathConstants.STORAGE_PATH_PREFIX}/${nodePath}`;
    }

    // 验证路径格式，防止路径遍历攻击
    if (!StorageValidationHelper.isValidNodePath(nodePath)) {
      console.error('无效的节点路径格式', { nodePath });
      throw new Error(t('无效的节点路径格式'));
    }

    return this.buildMxwebFileUrl({ nodePath });
  }

  /**
   * 构建公开文件访问 URL（唯一出口）
   *
   * 协议格式：
   * - 文件本体：/api/v1/public-file/access/{hash}[.原扩展名].mxweb
   * - 外部参照（未登录）：/api/v1/public-file/access/{rawHash}/{fileName}
   * accessName 由调用方按上述形态拼好后传入（各段是否 encodeURIComponent
   * 与既有行为一致，由调用方决定）；query 按 t（缓存戳）→ shareToken 顺序拼接。
   */
  static buildPublicFileAccessUrl(
    accessName: string,
    opts?: { cacheBust?: boolean; shareToken?: string }
  ): string {
    let url = `${this.PUBLIC_FILE_ACCESS_PREFIX}${accessName}`;
    const params: string[] = [];
    if (opts?.cacheBust) params.push(`t=${Date.now()}`);
    if (opts?.shareToken)
      params.push(`shareToken=${encodeURIComponent(opts.shareToken)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return url;
  }

  /**
   * 从 updatedAt 推导 t= 缓存时间戳。缺失或无法解析时回退 Date.now()——
   * 宁可强制一次新鲜请求，也不产出 t=NaN 的死缓存 URL（此前各构造点分别
   * 「产出 NaN / 回落 Date.now() / 抛错」，此为唯一口径）。
   */
  static resolveCacheTimestamp(updatedAt?: string | null): number {
    const ts = updatedAt ? new Date(updatedAt).getTime() : NaN;
    return Number.isFinite(ts) ? ts : Date.now();
  }

  /**
   * 从公开文件访问 URL 提取 hash 段（外部参照解析用）；非该形态返回 null
   */
  static extractPublicFileHash(url: string): string | null {
    const match = url.match(/\/api\/v1\/public-file\/access\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  /**
   * 从 mxweb 访问 URL 提取节点基底目录（YYYYMM/nodeId，外部参照拼子路径用）；
   * 非 mxcad filesData 形态返回 null
   */
  static extractMxwebBaseDir(url: string): string | null {
    const match = url.match(/\/api\/v1\/mxcad\/filesData\/([^/]+\/[^/]+)\//);
    return match?.[1] ?? null;
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
    nodeId?: string;
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
    context?: string
  ): Promise<T> {
    const ctx = context ?? t('重试操作');
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
