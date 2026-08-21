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

import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
import {
  IVersionControl,
  CommitResult,
  HistoryResult,
  ListResult,
  FileContentResult,
  HistoryEntry,
} from '../interfaces/version-control.interface';

/**
 * standalone 模式的版本控制 HTTP 实现
 *
 * 通过 storage-service 的 /v1/svn/* 接口提供 SVN 能力（#274）。
 * storage-service 仅暴露单路径 commit / history / cat 三个接口：
 * - 支持：getFileHistory / getFileContentAtRevision / commitFiles /
 *   commitNodeDirectory / isFirstCommit
 * - 暂不支持（storage-service 无对应接口，抛 NotImplementedException）：
 *   listDirectoryAtRevision / deleteNodeDirectory / commitWorkingCopy
 */
@Injectable()
export class HttpVersionControlProvider implements IVersionControl {
  private readonly logger = new Logger(HttpVersionControlProvider.name);
  private readonly baseUrl: string;
  private readonly useHttps: boolean;
  private readonly filesDataPath?: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('STORAGE_SERVICE_URL') ||
      'http://localhost:3200';
    this.useHttps = this.baseUrl.startsWith('https');
    this.filesDataPath = this.configService.get<string>('filesDataPath', {
      infer: true,
    });
  }

  isReady(): boolean {
    return true;
  }

  async ensureInitialized(): Promise<void> {
    // standalone 模式无本地初始化
  }

  async isFirstCommit(directoryPath: string): Promise<boolean> {
    const storagePath = this.toStorageRelativePath(directoryPath);
    try {
      const result = await this.request(
        `/v1/svn/history?path=${encodeURIComponent(storagePath)}`,
        'GET',
      );
      const entries = (result.entries || []) as unknown[];
      return entries.length === 0;
    } catch (error) {
      this.logger.error(
        `判断首次提交失败: ${directoryPath}, 错误: ${error.message}`
      );
      throw error;
    }
  }

  async commitNodeDirectory(
    directoryPath: string,
    message: string,
    userId?: string,
    userName?: string
  ): Promise<CommitResult> {
    const storagePath = this.toStorageRelativePath(directoryPath);
    const commitData = {
      type: 'file_operation',
      message,
      userId: userId || '',
      userName: userName || '',
      timestamp: new Date().toISOString(),
    };
    try {
      const result = await this.request(
        '/v1/svn/commit',
        'POST',
        JSON.stringify({ path: storagePath, message: JSON.stringify(commitData) }),
      );
      this.logger.log(`目录提交成功: ${directoryPath}`);
      return {
        success: true,
        message: '提交成功',
        revision: result.revision,
        data: result.output,
      };
    } catch (error) {
      this.logger.error(`目录提交失败: ${directoryPath}, 错误: ${error.message}`);
      return { success: false, message: `提交失败: ${error.message}` };
    }
  }

  async commitFiles(
    filePaths: string[],
    message: string
  ): Promise<CommitResult> {
    if (filePaths.length === 0) {
      return { success: true, message: '没有文件需要提交' };
    }
    try {
      for (const filePath of filePaths) {
        const storagePath = this.toStorageRelativePath(filePath);
        await this.request(
          '/v1/svn/commit',
          'POST',
          JSON.stringify({ path: storagePath, message }),
        );
      }
      this.logger.log(`批量提交成功: ${filePaths.length} 个文件`);
      return { success: true, message: '提交成功' };
    } catch (error) {
      this.logger.error(`批量提交失败: ${error.message}`);
      return { success: false, message: `提交失败: ${error.message}` };
    }
  }

  async commitWorkingCopy(message: string): Promise<CommitResult> {
    this.logger.warn(
      'commitWorkingCopy 暂不支持: storage-service 无工作副本概念'
    );
    throw new NotImplementedException(
      'standalone 模式暂不支持提交整个工作副本（storage-service 仅支持单路径 commit）'
    );
  }

  async deleteNodeDirectory(directoryPath: string): Promise<CommitResult> {
    this.logger.warn(
      `deleteNodeDirectory 暂不支持: ${directoryPath} (storage-service 无 SVN delete 接口)`
    );
    throw new NotImplementedException(
      'standalone 模式暂不支持 SVN 标记删除（storage-service 无对应接口）'
    );
  }

  async getFileHistory(
    filePath: string,
    limit?: number
  ): Promise<HistoryResult> {
    const storagePath = this.toStorageRelativePath(filePath);
    try {
      const result = await this.request(
        `/v1/svn/history?path=${encodeURIComponent(storagePath)}`,
        'GET',
      );
      const entries: HistoryEntry[] = ((result.entries || []) as Array<{
        revision: number | string;
        author?: string;
        timestamp?: string;
        message?: string;
      }>).map((entry) => ({
        revision: entry.revision,
        author: entry.author || '',
        date: new Date(entry.timestamp || Date.now()),
        message: entry.message || '',
      }));
      const totalCount = entries.length;
      // storage-service 返回新→旧（svn log 惯例），反转成旧→新与 embedded 行为一致
      entries.reverse();
      const effectiveLimit =
        limit ?? HttpVersionControlProvider.DEFAULT_HISTORY_LIMIT;
      if (effectiveLimit > 0 && totalCount > effectiveLimit) {
        entries.splice(0, totalCount - effectiveLimit);
      }
      this.logger.log(
        `获取目录历史成功: ${storagePath}, 共 ${entries.length} 条记录（总修改 ${totalCount} 次）`
      );
      return {
        success: true,
        message: '获取成功',
        entries,
        totalCount,
      };
    } catch (error) {
      this.logger.error(
        `获取目录历史失败: ${filePath}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `获取失败: ${error.message}`,
        entries: [],
        totalCount: 0,
      };
    }
  }

  async listDirectoryAtRevision(
    directoryPath: string,
    revision: string | number
  ): Promise<ListResult> {
    this.logger.warn(
      `listDirectoryAtRevision 暂不支持: ${directoryPath} @ r${revision} (storage-service 无 /v1/svn/list 接口)`
    );
    throw new NotImplementedException(
      'standalone 模式暂不支持列出版本目录（storage-service 无对应接口）'
    );
  }

  async getFileContentAtRevision(
    filePath: string,
    revision: string | number
  ): Promise<FileContentResult> {
    const storagePath = this.toStorageRelativePath(filePath);
    try {
      const data = await this.requestBuffer(
        `/v1/svn/cat?path=${encodeURIComponent(storagePath)}&revision=${revision}`,
        'GET',
      );
      if (!data || data.length === 0) {
        this.logger.error(
          `获取文件内容失败: ${filePath} @ r${revision}, 内容为空`
        );
        return {
          success: false,
          message: '获取失败: 文件内容为空',
        };
      }
      this.logger.log(
        `获取文件内容成功: ${filePath} @ r${revision}, 大小: ${data.length} 字节`
      );
      return {
        success: true,
        message: '获取成功',
        content: data,
      };
    } catch (error) {
      this.logger.error(
        `获取文件内容失败: ${filePath} @ r${revision}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `获取失败: ${error.message}`,
      };
    }
  }

  /** 默认历史返回条数（与 MxVersionControlProvider 对齐） */
  private static readonly DEFAULT_HISTORY_LIMIT = 50;

  /**
   * 归一化路径为 storage-service 内的相对路径：
   * 剥离 /mxcad/file/、filesData/ 前缀；绝对路径在 filesDataPath 内时相对化。
   */
  private toStorageRelativePath(inputPath: string): string {
    const storagePath = FileUtils.stripStoragePrefix(inputPath);
    if (path.isAbsolute(storagePath) && this.filesDataPath) {
      return path
        .relative(this.filesDataPath, storagePath)
        .replace(/\\/g, '/');
    }
    return storagePath.replace(/\\/g, '/');
  }

  private request(
    path: string,
    method: string,
    body?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (this.useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      };
      if (body) options.headers!['Content-Length'] = Buffer.byteLength(body);
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${data.substring(0, 200)}`
              )
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      if (body) req.write(body);
      req.end();
    });
  }

  private requestBuffer(path: string, method: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = this.useHttps ? https : http;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (this.useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      };
      const req = mod.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const body = Buffer.concat(chunks).toString('utf-8');
            return reject(
              new Error(
                `HTTP ${res.statusCode} for ${method} ${path}: ${body.substring(0, 200)}`
              )
            );
          }
          resolve(Buffer.concat(chunks));
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout: ${method} ${path}`));
      });
      req.end();
    });
  }
}
