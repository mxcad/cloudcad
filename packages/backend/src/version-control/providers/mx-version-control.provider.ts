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

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import {
  mxCheckout,
  mxAdd,
  mxCommit,
  mxDelete,
  mxadminCreate,
  mxImport,
  mxLog,
  mxCat,
  mxList,
  mxPropset,
  mxUpdate,
  mxCleanup,
  mxSwitch,
  getPlatformInfo,
} from '@cloudcad/mx-version-tool';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
import {
  IVersionControl,
  CommitResult,
  HistoryResult,
  ListResult,
  FileContentResult,
  HistoryEntry,
  HistoryPath,
} from '../interfaces/version-control.interface';

const mxCheckoutAsync = promisify(mxCheckout);
const mxAddAsync = promisify(mxAdd);
const mxCommitAsync = promisify(mxCommit);
const mxDeleteAsync = promisify(mxDelete);
const mxadminCreateAsync = promisify(mxadminCreate);
const mxImportAsync = promisify(mxImport);
const mxLogAsync = promisify(mxLog);
const mxCatAsync = promisify(mxCat);
const mxListAsync = promisify(mxList) as (
  repoUrl: string,
  isRecursive: boolean,
  revision: number | null,
  username: string | null,
  password: string | null
) => Promise<string>;
const mxPropsetAsync = promisify(mxPropset);
const mxUpdateAsync = promisify(mxUpdate);
const mxCleanupAsync = promisify(mxCleanup);
const mxSwitchAsync = promisify(mxSwitch) as (
  oldUrl: string,
  newUrl: string,
  targetPath: string,
  username: string | null,
  password: string | null
) => Promise<string>;

@Injectable()
export class MxVersionControlProvider implements IVersionControl, OnModuleInit {
  private readonly logger = new Logger(MxVersionControlProvider.name);
  private readonly mxRepoPath: string;
  private readonly filesDataPath: string;
  private readonly mxIgnorePatterns: string[];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const mxRepoPath = this.configService.get('mxRepoPath', { infer: true });
    if (!mxRepoPath) {
      throw new InternalServerErrorException(
        '缺少 mxRepoPath 配置，请检查版本控制模块的环境变量',
      );
    }
    this.mxRepoPath = mxRepoPath;

    const filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    });
    if (!filesDataPath) {
      throw new InternalServerErrorException(
        '缺少 filesDataPath 配置，请检查版本控制模块的环境变量',
      );
    }
    this.filesDataPath = filesDataPath;

    this.mxIgnorePatterns =
      this.configService.get('mx', { infer: true })?.ignorePatterns || [];

    this.logger.log(`MX 仓库路径: ${this.mxRepoPath}`);
    this.logger.log(`filesData 路径: ${this.filesDataPath}`);
    this.logger.log(`MX 忽略模式: ${this.mxIgnorePatterns.join(', ')}`);
    this.logger.log(`MX_REPO_PATH 环境变量: ${process.env.MX_REPO_PATH || '(未设置)'}`);
    this.logger.log(`FILES_DATA_PATH 环境变量: ${process.env.FILES_DATA_PATH || '(未设置)'}`);
  }

  async onModuleInit(): Promise<void> {
    this.initPromise = this.initializeMxRepository()
      .then(() => {
        this.logger.log('MX 版本控制初始化完成（异步）');
        this.isInitialized = true;
      })
      .catch((error) => {
        this.logger.error(`MX 初始化失败: ${error.message}`, error.stack);
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

  private async initializeMxRepository(): Promise<void> {
    if (!fs.existsSync(this.mxRepoPath)) {
      this.logger.log(`创建 MX 仓库: ${this.mxRepoPath}`);
      await mxadminCreateAsync(this.mxRepoPath);
      this.logger.log(`MX 仓库创建成功`);
    } else {
      this.logger.log(`MX 仓库已存在: ${this.mxRepoPath}`);
    }

    const mxDir = path.join(this.filesDataPath, '.svn');
    if (!fs.existsSync(mxDir)) {
      const filesDataExists = fs.existsSync(this.filesDataPath);
      const filesDataIsEmpty =
        !filesDataExists || fs.readdirSync(this.filesDataPath).length === 0;

      if (filesDataIsEmpty) {
        const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}`;
        this.logger.log(`检出 MX 仓库: ${repoUrl} -> ${this.filesDataPath}`);

        if (!filesDataExists) {
          fs.mkdirSync(this.filesDataPath, { recursive: true });
        }

        await mxCheckoutAsync(repoUrl, this.filesDataPath, null, null);
        this.logger.log(`MX 检出成功`);
      } else {
        const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}`;
        this.logger.warn(`filesData 不为空，使用 mx import 导入现有内容...`);

        try {
          const importResult = await mxImportAsync(
            this.filesDataPath,
            repoUrl,
            'Initial import'
          );
          this.logger.log(`mx import 成功: ${importResult}`);
        } catch (error) {
          if (error.message && error.message.includes('E160020')) {
            this.logger.warn(`MX 仓库已有数据，跳过 import`);
          } else {
            this.logger.error(`mx import 失败: ${error.message}`);
            throw error;
          }
        }

        try {
          this.logger.log(`创建工作副本...`);
          await mxCheckoutAsync(repoUrl, this.filesDataPath, null, null);
          this.logger.log(`MX 检出成功`);
        } catch (error) {
          this.logger.error(`MX checkout 失败: ${error.message}`);
          throw error;
        }
      }
    } else {
      this.logger.log(`filesData 已是 MX 工作副本`);
      await this.ensureWorkingCopyUrl();
    }

    this.isInitialized = true;
    this.logger.log('MX 版本控制初始化完成');

    await this.setupGlobalIgnores();
  }

  private isMxLockedError(error: Error): boolean {
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
      if (this.isMxLockedError(error)) {
        this.logger.warn(`${operationName} 遇到锁定错误，尝试 cleanup...`);
        try {
          await mxCleanupAsync(this.filesDataPath);
          this.logger.log('MX cleanup 成功，重试操作...');
          return await operation();
        } catch (cleanupError) {
          this.logger.error(`MX cleanup 失败: ${cleanupError.message}`);
          throw error;
        }
      }
      throw error;
    }
  }

  private async setupGlobalIgnores(): Promise<void> {
    if (this.mxIgnorePatterns.length === 0) {
      this.logger.log('未配置 MX 忽略模式，跳过设置');
      return;
    }

    try {
      this.logger.log('更新 MX 工作副本...');
      await this.executeWithLockRetry(
        () => mxUpdateAsync(this.filesDataPath, null, null),
        'mx update'
      );
      this.logger.log('MX 工作副本更新成功');

      const ignoreValue = this.mxIgnorePatterns.join('\n');

      this.logger.log(
        `设置 svn:global-ignores: ${this.mxIgnorePatterns.join(', ')}`
      );

      await mxPropsetAsync(
        this.filesDataPath,
        'svn:global-ignores',
        ignoreValue
      );

      const commitMessage = JSON.stringify({
        type: 'update_ignores',
        message: 'Update global ignore patterns',
        patterns: this.mxIgnorePatterns,
        timestamp: new Date().toISOString(),
      });

      await mxCommitAsync(
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

  private collectParentDirectories(filePaths: string[]): string[] {
    const dirs = new Set<string>();
    const filesDataRoot = this.filesDataPath;

    for (const filePath of filePaths) {
      let dir = path.dirname(filePath);
      while (dir !== filesDataRoot && dir !== path.dirname(dir)) {
        dirs.add(dir);
        dir = path.dirname(dir);
      }
    }

    return Array.from(dirs).sort((a, b) => {
      const depthA = a.split(path.sep).length;
      const depthB = b.split(path.sep).length;
      return depthA - depthB;
    });
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

  async isFirstCommit(directoryPath: string): Promise<boolean> {
    try {
      const relativePath = path.relative(this.filesDataPath, directoryPath);
      const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}/${relativePath.replace(/\\/g, '/')}`;

      await mxListAsync(repoUrl, false, null, null, null);
      return false;
    } catch {
      return true;
    }
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

    FileUtils.validatePath(directoryPath, this.filesDataPath);

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化，跳过提交');
      return { success: false, message: 'MX 未初始化' };
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

      try {
        await mxAddAsync([directoryPath], true, false, true);
        this.logger.log(`递归添加目录: ${directoryPath}`);
      } catch (error) {
        if (!error.message.includes('already under version control')) {
          this.logger.warn(
            `添加目录失败: ${directoryPath}, 错误: ${error.message}`
          );
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

      const result = await mxCommitAsync(
        [directoryPath],
        fullMessage,
        true,
        null,
        null
      );

      this.logger.log(`目录提交成功: ${directoryPath}`);
      this.logger.debug(`[MX_COMMIT 原始输出] ${result}`);
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
        `MX 提交失败，已备份 ${backedUpFilePaths.length} 个文件路径，调用方可能需要清理相关资源`
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
      this.logger.warn('MX 未初始化，跳过提交');
      return { success: false, message: 'MX 未初始化' };
    }

    if (filePaths.length === 0) {
      return { success: true, message: '没有文件需要提交' };
    }

    try {
      const parentDirs = this.collectParentDirectories(filePaths);
      for (const dir of parentDirs) {
        try {
          await mxAddAsync([dir], false, false, false);
        } catch (error) {
          if (!error.message.includes('already under version control')) {
            this.logger.warn(
              `添加中间目录失败: ${dir}, 错误: ${error.message}`
            );
          }
        }
      }

      await mxAddAsync(filePaths, false, true, false);
      const allPaths = [...parentDirs, ...filePaths];
      const result = await mxCommitAsync(
        allPaths,
        message,
        false,
        null,
        null
      );

      this.logger.log(`批量提交成功: ${filePaths.length} 个文件`);
      this.logger.debug(`[MX_COMMIT 原始输出] ${result}`);
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
      this.logger.warn('MX 未初始化，跳过提交');
      return { success: false, message: 'MX 未初始化' };
    }

    try {
      const result = await mxCommitAsync(
        [this.filesDataPath],
        message,
        true,
        null,
        null
      );

      this.logger.log(`工作副本已提交: ${message}`);
      this.logger.debug(`[MX_COMMIT 原始输出] ${result}`);
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

    FileUtils.validatePath(directoryPath, this.filesDataPath);

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化，跳过删除');
      return { success: false, message: 'MX 未初始化' };
    }

    try {
      const result = await mxDeleteAsync(
        [directoryPath],
        true,
        true,
        null,
        null
      );

      this.logger.log(`目录已从 MX 标记删除: ${directoryPath}`);
      this.logger.debug(`[MX_DELETE 原始输出] ${result}`);
      return {
        success: true,
        message: '删除成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录从 MX 标记删除失败: ${directoryPath}, 错误: ${error.message}`
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
      this.logger.warn('MX 未初始化');
      return { success: false, message: 'MX 未初始化', entries: [] };
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

      const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}/${directoryPath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[MX] 获取目录历史 - 原始路径: ${path}, 目录路径: ${directoryPath}, 仓库URL: ${repoUrl}`
      );

      const xmlResult = await mxLogAsync(
        repoUrl,
        limit || 50,
        true,
        null,
        null
      );

      this.logger.debug(`[MX_LOG 原始XML] ${xmlResult || '(空)'}`);

      const entries = this.parseMxLogXml(xmlResult || '', true);

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

  private parseMxLogXml(xmlString: string, debugLog = false): HistoryEntry[] {
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

      if (debugLog) {
        this.logger.debug(
          `[MX_LOG 解析条目] r${revision} | 作者: ${author} | 日期: ${date.toISOString()} | 消息: ${message.substring(0, 200)} | 文件数: ${paths.length}`
        );
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

    FileUtils.validatePath(directoryPath, this.filesDataPath);

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化');
      return { success: false, message: 'MX 未初始化' };
    }

    try {
      const relativePath =
        path.relative(this.filesDataPath, directoryPath) || directoryPath;
      const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}/${relativePath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[MX] 列出目录内容 - 目录: ${relativePath}, 版本: r${revision}, URL: ${repoUrl}`
      );

      const result = await mxListAsync(repoUrl, false, Number(revision), null, null);

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

    FileUtils.validatePath(filePath, this.filesDataPath);

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化');
      return { success: false, message: 'MX 未初始化' };
    }

    try {
      const relativePath =
        path.relative(this.filesDataPath, filePath) || filePath;
      const targetPath = path.join(this.filesDataPath, relativePath);

      const contentStr = await mxCatAsync(targetPath, Number(revision), null, null);
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

  private async ensureWorkingCopyUrl(): Promise<void> {
    const expectedUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}`;

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync(
        `"${getPlatformInfo().mxPath}" info --show-item url "${this.filesDataPath}"`,
        { windowsHide: true }
      );
      const currentUrl = (stdout || '').trim();

      if (!currentUrl) {
        this.logger.warn('无法获取工作副本 URL，跳过 URL 检查');
        return;
      }

      if (currentUrl !== expectedUrl) {
        this.logger.log(
          `工作副本 URL 不匹配: ${currentUrl} -> ${expectedUrl}，正在修正...`
        );
        try {
          await mxSwitchAsync(currentUrl, expectedUrl, this.filesDataPath, null, null);
          this.logger.log('工作副本 URL 修正成功');
        } catch (switchError) {
          this.logger.error(
            `工作副本 URL 修正失败: ${switchError.message}`
          );
        }
      } else {
        this.logger.debug(`工作副本 URL 正确: ${currentUrl}`);
      }
    } catch (error) {
      this.logger.warn(
        `获取工作副本 URL 失败 (${error.message})，跳过 URL 检查`
      );
    }
  }
}
