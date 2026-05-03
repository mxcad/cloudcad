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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import {
  svnCheckout,
  svnAdd,
  svnCommit,
  svnDelete,
  svnadminCreate,
  svnImport,
  svnLog,
  svnCat,
  svnList,
  svnPropset,
  svnUpdate,
  svnCleanup,
} from '@cloudcad/svn-version-tool';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  IVersionControl,
  CommitResult,
  HistoryResult,
  ListResult,
  FileContentResult,
  HistoryEntry,
  HistoryPath,
} from '../interfaces/version-control.interface';

const svnCheckoutAsync = promisify(svnCheckout);
const svnAddAsync = promisify(svnAdd);
const svnCommitAsync = promisify(svnCommit);
const svnDeleteAsync = promisify(svnDelete);
const svnadminCreateAsync = promisify(svnadminCreate);
const svnImportAsync = promisify(svnImport);
const svnLogAsync = promisify(svnLog);
const svnCatAsync = promisify(svnCat);
const svnListAsync = promisify(svnList) as (
  repoUrl: string,
  isRecursive: boolean,
  revision: number | null,
  username: string | null,
  password: string | null
) => Promise<string>;
const svnPropsetAsync = promisify(svnPropset);
const svnUpdateAsync = promisify(svnUpdate);
const svnCleanupAsync = promisify(svnCleanup);

@Injectable()
export class SvnVersionControlProvider implements IVersionControl, OnModuleInit {
  private readonly logger = new Logger(SvnVersionControlProvider.name);
  private readonly svnRepoPath: string;
  private readonly filesDataPath: string;
  private readonly svnIgnorePatterns: string[];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    this.svnRepoPath = this.configService.get('svnRepoPath', { infer: true })!;
    this.filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    })!;
    this.svnIgnorePatterns =
      this.configService.get('svn', { infer: true })?.ignorePatterns || [];

    this.logger.log(`SVN 仓库路径: ${this.svnRepoPath}`);
    this.logger.log(`filesData 路径: ${this.filesDataPath}`);
    this.logger.log(`SVN 忽略模式: ${this.svnIgnorePatterns.join(', ')}`);
  }

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initializeSvnRepository()
      .then(() => {
        this.logger.log('SVN 版本控制初始化完成（异步）');
        this.isInitialized = true;
      })
      .catch((error) => {
        this.logger.error(`SVN 初始化失败: ${error.message}`, error.stack);
        this.isInitialized = false;
      });
  }

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    await this.onModuleInit();
    await this.initPromise;
  }

  private async initializeSvnRepository(): Promise<void> {
    if (!fs.existsSync(this.svnRepoPath)) {
      this.logger.log(`创建 SVN 仓库: ${this.svnRepoPath}`);
      await svnadminCreateAsync(this.svnRepoPath);
      this.logger.log(`SVN 仓库创建成功`);
    } else {
      this.logger.log(`SVN 仓库已存在: ${this.svnRepoPath}`);
    }

    const svnDir = path.join(this.filesDataPath, '.svn');
    if (!fs.existsSync(svnDir)) {
      const filesDataExists = fs.existsSync(this.filesDataPath);
      const filesDataIsEmpty =
        !filesDataExists || fs.readdirSync(this.filesDataPath).length === 0;

      if (filesDataIsEmpty) {
        const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}`;
        this.logger.log(`检出 SVN 仓库: ${repoUrl} -> ${this.filesDataPath}`);

        if (!filesDataExists) {
          fs.mkdirSync(this.filesDataPath, { recursive: true });
        }

        await svnCheckoutAsync(repoUrl, this.filesDataPath, null, null);
        this.logger.log(`SVN 检出成功`);
      } else {
        const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}`;
        this.logger.warn(`filesData 不为空，使用 svn import 导入现有内容...`);

        try {
          const importResult = await svnImportAsync(
            this.filesDataPath,
            repoUrl,
            'Initial import'
          );
          this.logger.log(`svn import 成功: ${importResult}`);
        } catch (error) {
          if (error.message && error.message.includes('E160020')) {
            this.logger.warn(`SVN 仓库已有数据，跳过 import`);
          } else {
            this.logger.error(`svn import 失败: ${error.message}`);
            throw error;
          }
        }

        try {
          this.logger.log(`创建工作副本...`);
          await svnCheckoutAsync(repoUrl, this.filesDataPath, null, null);
          this.logger.log(`SVN 检出成功`);
        } catch (error) {
          this.logger.error(`SVN checkout 失败: ${error.message}`);
          throw error;
        }
      }
    } else {
      this.logger.log(`filesData 已是 SVN 工作副本`);
    }

    this.isInitialized = true;
    this.logger.log('SVN 版本控制初始化完成');

    await this.setupGlobalIgnores();
  }

  private isSvnLockedError(error: Error): boolean {
    return (
      error.message.includes('E155004') ||
      error.message.includes('locked') ||
      error.message.includes('is already locked')
    );
  }

  private async executeWithLockRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isSvnLockedError(error)) {
        this.logger.warn(`${operationName} 遇到锁定错误，尝试 cleanup...`);
        try {
          await svnCleanupAsync(this.filesDataPath);
          this.logger.log('SVN cleanup 成功，重试操作...');
          return await operation();
        } catch (cleanupError) {
          this.logger.error(`SVN cleanup 失败: ${cleanupError.message}`);
          throw error;
        }
      }
      throw error;
    }
  }

  private async setupGlobalIgnores(): Promise<void> {
    if (this.svnIgnorePatterns.length === 0) {
      this.logger.log('未配置 SVN 忽略模式，跳过设置');
      return;
    }

    try {
      this.logger.log('更新 SVN 工作副本...');
      await this.executeWithLockRetry(
        () => svnUpdateAsync(this.filesDataPath, null, null),
        'svn update'
      );
      this.logger.log('SVN 工作副本更新成功');

      const ignoreValue = this.svnIgnorePatterns.join('\n');

      this.logger.log(
        `设置 svn:global-ignores: ${this.svnIgnorePatterns.join(', ')}`
      );

      await svnPropsetAsync(
        this.filesDataPath,
        'svn:global-ignores',
        ignoreValue
      );

      const commitMessage = JSON.stringify({
        type: 'update_ignores',
        message: 'Update global ignore patterns',
        patterns: this.svnIgnorePatterns,
        timestamp: new Date().toISOString(),
      });

      await svnCommitAsync(
        [this.filesDataPath],
        commitMessage,
        false,
        null,
        null
      );
      this.logger.log('svn:global-ignores 设置成功并已提交');
    } catch (error) {
      this.logger.warn(`设置 svn:global-ignores 失败: ${error.message}`);
    }
  }

  private collectFilePaths(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    let results: string[] = [];
    const list = fs.readdirSync(dirPath);

    for (const file of list) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat && stat.isDirectory()) {
        results = results.concat(this.collectFilePaths(filePath));
      } else {
        results.push(filePath);
      }
    }

    return results;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async commitNodeDirectory(
    directoryPath: string,
    message: string,
    userId?: string,
    userName?: string
  ): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    let backedUpFilePaths: string[] = [];
    try {
      backedUpFilePaths = this.collectFilePaths(directoryPath);
      this.logger.log(
        `已备份 ${backedUpFilePaths.length} 个待提交文件路径`
      );
    } catch (backupError) {
      this.logger.warn(`备份文件路径失败: ${backupError.message}`);
    }

    try {
      const filesDataRoot = this.filesDataPath;
      const relativePath = path.relative(filesDataRoot, directoryPath);
      const pathParts = relativePath.split(path.sep);

      let currentPath = filesDataRoot;
      for (let i = 0; i < pathParts.length; i++) {
        currentPath = path.join(currentPath, pathParts[i]);
        const isTargetDirectory = i === pathParts.length - 1;

        if (isTargetDirectory) {
          try {
            await svnAddAsync([currentPath], true);
            this.logger.log(`递归添加目录: ${currentPath}`);
          } catch (error) {
            if (!error.message.includes('already under version control')) {
              this.logger.warn(
                `添加目录失败: ${currentPath}, 错误: ${error.message}`
              );
            }
          }
        } else {
          try {
            await svnAddAsync([currentPath], false);
          } catch (error) {
            if (!error.message.includes('already under version control')) {
              this.logger.warn(
                `添加中间目录失败: ${currentPath}, 错误: ${error.message}`
              );
            }
          }

          try {
            const commitMessage = JSON.stringify({
              type: 'add_directory',
              message: `Add directory: ${pathParts[i]}`,
              timestamp: new Date().toISOString(),
            });
            await svnCommitAsync(
              [currentPath],
              commitMessage,
              false,
              null,
              null
            );
            this.logger.log(`中间目录提交成功: ${currentPath}`);
          } catch (error) {
            if (!error.message.includes('not under version control')) {
              this.logger.warn(
                `提交中间目录失败: ${currentPath}, 错误: ${error.message}`
              );
            }
          }
        }
      }

      const commitData = {
        type: 'file_operation',
        message: message,
        userId: userId || '',
        userName: userName || '',
        timestamp: new Date().toISOString(),
      };
      const fullMessage = JSON.stringify(commitData);

      const result = await svnCommitAsync(
        [directoryPath],
        fullMessage,
        true,
        null,
        null
      );

      this.logger.log(`目录提交成功: ${directoryPath}`);
      return {
        success: true,
        message: '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录提交失败: ${directoryPath}, 错误: ${error.message}`
      );

      this.logger.warn(
        `SVN 提交失败，已备份 ${backedUpFilePaths.length} 个文件路径，调用方可能需要清理相关资源`
      );

      return {
        success: false,
        message: `提交失败: ${error.message}`,
        data: JSON.stringify({
          error: error.message,
          backedUpFilePaths,
          directoryPath,
        }),
      };
    }
  }

  async commitFiles(filePaths: string[], message: string): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    if (filePaths.length === 0) {
      return { success: true, message: '没有文件需要提交' };
    }

    try {
      await svnAddAsync(filePaths, false);
      const result = await svnCommitAsync(
        filePaths,
        message,
        false,
        null,
        null
      );

      this.logger.log(`批量提交成功: ${filePaths.length} 个文件`);
      return {
        success: true,
        message: '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(`批量提交失败: ${error.message}`);
      return {
        success: false,
        message: `提交失败: ${error.message}`,
      };
    }
  }

  async commitWorkingCopy(message: string): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const result = await svnCommitAsync(
        [this.filesDataPath],
        message,
        true,
        null,
        null
      );

      this.logger.log(`工作副本已提交: ${message}`);
      return {
        success: true,
        message: '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(`工作副本提交失败: ${error.message}`);
      return {
        success: false,
        message: `提交失败: ${error.message}`,
      };
    }
  }

  async deleteNodeDirectory(directoryPath: string): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过删除');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const result = await svnDeleteAsync(
        [directoryPath],
        true,
        true,
        null,
        null
      );

      this.logger.log(`目录已从 SVN 标记删除: ${directoryPath}`);
      return {
        success: true,
        message: '删除成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录从 SVN 标记删除失败: ${directoryPath}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `删除失败: ${error.message}`,
      };
    }
  }

  async getFileHistory(path: string, limit?: number): Promise<HistoryResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化', entries: [] };
    }

    try {
      let relativePath = path;
      if (path.startsWith('filesData/')) {
        relativePath = path.slice('filesData/'.length);
      }

      const pathParts = relativePath.split('/').filter(Boolean);
      let directoryPath: string;

      const lastPart = pathParts[pathParts.length - 1] || '';
      const hasExtension = lastPart.includes('.') && !lastPart.startsWith('.');

      if (hasExtension && pathParts.length > 1) {
        directoryPath = pathParts.slice(0, -1).join('/');
      } else {
        directoryPath = relativePath;
      }

      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}/${directoryPath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[SVN] 获取目录历史 - 原始路径: ${path}, 目录路径: ${directoryPath}, 仓库URL: ${repoUrl}`
      );

      const xmlResult = await svnLogAsync(
        repoUrl,
        limit || 50,
        true,
        null,
        null
      );

      const entries = this.parseSvnLogXml(xmlResult || '');

      this.logger.log(
        `获取目录历史成功: ${directoryPath}, 共 ${entries.length} 条记录`
      );
      return {
        success: true,
        message: '获取成功',
        entries,
      };
    } catch (error) {
      this.logger.error(
        `获取目录历史失败: ${path}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `获取失败: ${error.message}`,
        entries: [],
      };
    }
  }

  private parseSvnLogXml(xmlString: string): HistoryEntry[] {
    const entries: HistoryEntry[] = [];

    const logEntryRegex =
      /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g;
    let match;

    while ((match = logEntryRegex.exec(xmlString)) !== null) {
      const revision = parseInt(match[1], 10);
      const content = match[2];

      const authorMatch = /<author>(.*?)<\/author>/.exec(content);
      const author = authorMatch ? this.decodeXmlEntities(authorMatch[1]) : '';

      const dateMatch = /<date>(.*?)<\/date>/.exec(content);
      const date = dateMatch ? new Date(dateMatch[1]) : new Date();

      const msgMatch = /<msg>(.*?)<\/msg>/s.exec(content);
      const rawMessage = msgMatch?.[1]
        ? this.decodeXmlEntities(msgMatch[1])
        : '';

      let message = rawMessage;
      let userName: string | undefined;

      if (rawMessage) {
        try {
          const commitData = JSON.parse(rawMessage);
          message = commitData.message || rawMessage;
          userName = commitData.userName;
        } catch {
          // JSON 解析失败，使用原始消息
        }
      }

      const paths: HistoryPath[] = [];
      const pathsMatch = /<paths>([\s\S]*?)<\/paths>/.exec(content);
      if (pathsMatch) {
        const pathRegex =
          /<path[^>]*action="([AMDR])"[^>]*kind="(file|dir)"[^>]*>(.*?)<\/path>/g;
        let pathMatch;
        while ((pathMatch = pathRegex.exec(pathsMatch[1])) !== null) {
          paths.push({
            action: pathMatch[1] as 'A' | 'M' | 'D' | 'R',
            kind: pathMatch[2] as 'file' | 'dir',
            path: this.decodeXmlEntities(pathMatch[3] || ''),
          });
        }
      }

      entries.push({
        revision,
        author,
        date,
        message,
        userName,
        paths,
      });
    }

    return entries;
  }

  private decodeXmlEntities(str: string): string {
    const entityMap: Record<string, string> = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&#10;': '\n',
      '&#13;': '\r',
      '&#9;': '\t',
      '&#39;': "'",
      '&#34;': '"',
    };

    let decoded = str.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(
        new RegExp(entity.replace('(', '\\(').replace(')', '\\)'), 'g'),
        char
      );
    }

    return decoded;
  }

  async listDirectoryAtRevision(
    directoryPath: string,
    revision: string | number
  ): Promise<ListResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const relativePath =
        path.relative(this.filesDataPath, directoryPath) || directoryPath;
      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}/${relativePath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[SVN] 列出目录内容 - 目录: ${relativePath}, 版本: r${revision}, URL: ${repoUrl}`
      );

      const result = await svnListAsync(repoUrl, false, Number(revision), null, null);

      const files = result
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      this.logger.log(
        `列出目录内容成功: ${relativePath} @ r${revision}, 文件数: ${files.length}`
      );
      return {
        success: true,
        message: '获取成功',
        files,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `列出目录内容失败: ${directoryPath} @ r${revision}, 错误: ${err.message}`
      );
      return {
        success: false,
        message: `获取失败: ${err.message}`,
      };
    }
  }

  async getFileContentAtRevision(
    filePath: string,
    revision: string | number
  ): Promise<FileContentResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const relativePath =
        path.relative(this.filesDataPath, filePath) || filePath;
      const targetPath = path.join(this.filesDataPath, relativePath);

      const contentStr = await svnCatAsync(targetPath, Number(revision), null, null);
      const content = Buffer.from(contentStr);

      if (!content) {
        this.logger.error(
          `获取文件内容失败: ${filePath} @ r${revision}, 内容为空`
        );
        return {
          success: false,
          message: '获取失败: 文件内容为空',
        };
      }

      this.logger.log(
        `获取文件内容成功: ${filePath} @ r${revision}, 大小: ${content.length} 字节`
      );
      return {
        success: true,
        message: '获取成功',
        content,
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

  async rollbackToRevision(
    path: string,
    revision: string | number,
    message?: string
  ): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const targetPath = path.join(this.filesDataPath, path);
      await svnUpdateAsync(targetPath, Number(revision), null);

      const rollbackMessage =
        message ||
        JSON.stringify({
          type: 'rollback',
          path,
          revision,
          timestamp: new Date().toISOString(),
        });

      const result = await svnCommitAsync(
        [targetPath],
        rollbackMessage,
        false,
        null,
        null
      );

      this.logger.log(`回滚成功: ${path} to r${revision}`);
      return {
        success: true,
        message: '回滚成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(`回滚失败: ${path} to r${revision}, 错误: ${error.message}`);
      return {
        success: false,
        message: `回滚失败: ${error.message}`,
      };
    }
  }
}
