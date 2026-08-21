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
  mxRevert,
  mxInfo,
  mxRelocate,
} from '@cloudcad/mx-version-tool';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
import { I18nService } from 'nestjs-i18n';
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
const mxRevertAsync = promisify(mxRevert);
const mxInfoAsync = promisify(mxInfo) as (
  targetPath: string,
  username: string | null,
  password: string | null
) => Promise<string>;
const mxRelocateAsync = promisify(mxRelocate) as (
  fromUrl: string,
  toUrl: string,
  targetPath: string,
  username: string | null,
  password: string | null
) => Promise<string>;
const mxSwitchAsync = promisify(mxSwitch) as (
  oldUrl: string,
  newUrl: string,
  targetPath: string,
  username: string | null,
  password: string | null
) => Promise<string>;

@Injectable()
export class MxVersionControlProvider implements IVersionControl, OnModuleInit {
  /** 初始版本占位条目的 revision 哨兵值（本地备份，不在 SVN 中） */
  private static readonly INITIAL_VERSION_REVISION = -1;
  /** getFileHistory 未传 limit 时的默认返回条数 */
  private static readonly DEFAULT_HISTORY_LIMIT = 50;
  /** 拉取全量历史以便统计真实修改总次数（mxLog 不传 -l 即全量） */
  private static readonly FULL_HISTORY_FETCH_LIMIT = 0;

  private readonly logger = new Logger(MxVersionControlProvider.name);
  private readonly mxRepoPath: string;
  private readonly filesDataPath: string;
  private readonly mxIgnorePatterns: string[];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  /** 全局初始化互斥锁：确保 onModuleInit 与 ensureInitialized 并发调用时只执行一次仓库初始化 */
  private static initMutex: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly i18nService: I18nService
  ) {
    const mxRepoPath = this.configService.get('mxRepoPath', { infer: true });
    if (!mxRepoPath) {
      throw new InternalServerErrorException(
        '缺少 mxRepoPath 配置，请检查版本控制模块的环境变量'
      );
    }
    this.mxRepoPath = mxRepoPath;

    const filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    });
    if (!filesDataPath) {
      throw new InternalServerErrorException(
        '缺少 filesDataPath 配置，请检查版本控制模块的环境变量'
      );
    }
    this.filesDataPath = filesDataPath;

    this.mxIgnorePatterns =
      this.configService.get('mx', { infer: true })?.ignorePatterns || [];

    this.logger.log(`MX 仓库路径: ${this.mxRepoPath}`);
    this.logger.log(`filesData 路径: ${this.filesDataPath}`);
    this.logger.log(`MX 忽略模式: ${this.mxIgnorePatterns.join(', ')}`);
    this.logger.log(
      `MX_REPO_PATH 环境变量: ${process.env.MX_REPO_PATH || '(未设置)'}`
    );
    this.logger.log(
      `FILES_DATA_PATH 环境变量: ${process.env.FILES_DATA_PATH || '(未设置)'}`
    );
  }

  /** 触发仓库初始化。通过静态互斥锁保证并发调用（onModuleInit / ensureInitialized）只执行一次，避免重复 mxadminCreate 导致 E200011。 */
  private async initializeOnce(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (MxVersionControlProvider.initMutex) {
      await MxVersionControlProvider.initMutex;
      return;
    }
    MxVersionControlProvider.initMutex = this.initializeMxRepository()
      .then(() => {
        this.logger.log('MX 版本控制初始化完成（异步）');
        this.isInitialized = true;
      })
      .catch((error) => {
        this.logger.error(`MX 初始化失败: ${error.message}`, error.stack);
        this.isInitialized = false;
      })
      .finally(() => {
        MxVersionControlProvider.initMutex = null;
      });
    this.initPromise = MxVersionControlProvider.initMutex;
    await MxVersionControlProvider.initMutex;
  }

  async onModuleInit(): Promise<void> {
    await this.initializeOnce();
  }

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    await this.initializeOnce();
  }

  private async initializeMxRepository(): Promise<void> {
    if (!fs.existsSync(this.mxRepoPath)) {
      this.logger.log(`创建 MX 仓库: ${this.mxRepoPath}`);
      try {
        await mxadminCreateAsync(this.mxRepoPath);
        this.logger.log(`MX 仓库创建成功`);
      } catch (error) {
        // 幂等容错：目录已存在且非空（可能是上次中断残留或并发创建）
        // 时 mxadminCreate 报 E200011，此时视为仓库已存在，继续后续流程
        const errMsg =
          error instanceof Error ? error.message : String(error || '');
        if (
          errMsg.includes('E200011') ||
          errMsg.includes('exists and is non-empty') ||
          errMsg.includes('Could not create top-level directory')
        ) {
          this.logger.warn(
            `MX 仓库目录已存在且非空，视为已存在（幂等容错）: ${this.mxRepoPath}`
          );
        } else {
          throw error;
        }
      }
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
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
    }

    let backedUpFilePaths: string[] = [];
    try {
      backedUpFilePaths = this.collectFilePaths(directoryPath);
      this.logger.log(`已备份 ${backedUpFilePaths.length} 个待提交文件路径`);
    } catch (backupError) {
      this.logger.warn(`备份文件路径失败: ${backupError.message}`);
    }

    const commitData = {
      type: 'file_operation',
      message: message,
      userId: userId || '',
      userName: userName || '',
      timestamp: new Date().toISOString(),
    };
    const fullMessage = JSON.stringify(commitData);

    const filesDataRoot = this.filesDataPath;
    const relativePath = path.relative(filesDataRoot, directoryPath);
    const pathParts = relativePath.split(path.sep);

    // 包含所有中间父目录，避免父目录未在 SVN 仓库中存在时提交失败
    // 例如 filesData/202607/xxx → 需要提交 [filesData/202607, filesData/202607/xxx]
    const commitTargets: string[] = [];
    for (let i = 1; i <= pathParts.length; i++) {
      commitTargets.push(path.join(filesDataRoot, ...pathParts.slice(0, i)));
    }

    const doCommit = async () => {
      const result = await mxCommitAsync(
        commitTargets,
        fullMessage,
        true,
        null,
        null
      );
      return result;
    };

    try {
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

      const result = await doCommit();

      this.logger.log(`目录提交成功: ${directoryPath}`);
      this.logger.debug(`[MX_COMMIT 原始输出] ${result}`);
      return {
        success: true,
        message: this.i18nService.t('success.submitted') ?? '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录提交失败: ${directoryPath}, 错误: ${error.message}`
      );

      const doRetry = async (): Promise<CommitResult | null> => {
        try {
          await mxCleanupAsync(this.filesDataPath);

          const updateOrRelocate = async (): Promise<void> => {
            try {
              await mxUpdateAsync(this.filesDataPath, null, null);
            } catch (updateError) {
              if (
                updateError.message.includes('E170013') ||
                updateError.message.includes('E180001')
              ) {
                this.logger.warn(
                  `update 遇到仓库连接错误，尝试修正工作副本 URL...`
                );
                const fixed = await this.ensureWorkingCopyUrl();
                if (!fixed) {
                  throw updateError;
                }
                this.logger.log(`URL 修正成功，重试 update...`);
                await mxUpdateAsync(this.filesDataPath, null, null);
              } else {
                throw updateError;
              }
            }
          };

          await updateOrRelocate();

          try {
            await mxAddAsync([directoryPath], true, false, true);
          } catch (addError) {
            this.logger.warn(
              `E155010 修复后 add 失败（继续尝试 commit）: ${addError.message}`
            );
          }

          const retryResult = await doCommit();
          this.logger.log(`重试提交成功: ${directoryPath}`);
          return {
            success: true,
            message: this.i18nService.t('success.submitted') ?? '提交成功',
            data: retryResult,
          };
        } catch (retryError) {
          this.logger.error(`重试提交仍然失败: ${retryError.message}`);
          return null;
        }
      };

      if (error.message.includes('E155010')) {
        this.logger.warn(
          'E155010 检测到文件已加入 SVN 但磁盘缺失，开始循环修复...'
        );
        let lastError = error;
        let repairedCount = 0;
        for (let retryCount = 0; retryCount < 50; retryCount++) {
          const match = lastError.message.match(/E155010:\s+'([^']+)'/);
          if (!match) break;

          const missingPath = match[1];
          this.logger.warn(`修复 E155010 路径: ${missingPath}`);
          try {
            await mxRevertAsync(missingPath, true);
            repairedCount++;
          } catch (revertError) {
            this.logger.error(
              `revert 失败: ${missingPath}, ${revertError.message}`
            );
            break;
          }

          try {
            await mxCleanupAsync(this.filesDataPath);
            await mxUpdateAsync(this.filesDataPath, null, null);
          } catch (cleanupError) {
            this.logger.warn(
              `E155010 修复后 cleanup/update 失败（继续尝试 commit）: ${cleanupError.message}`
            );
          }

          try {
            await mxAddAsync([directoryPath], true, false, true);
          } catch (addError) {
            this.logger.warn(
              `E155010 修复后 add 失败（继续尝试 commit）: ${addError.message}`
            );
          }

          try {
            const commitResult = await doCommit();
            this.logger.log(
              `E155010 修复后提交成功 (已修复 ${repairedCount} 个路径)`
            );
            return {
              success: true,
              message: this.i18nService.t('success.submitted') ?? '提交成功',
              data: commitResult,
            };
          } catch (commitError) {
            lastError = commitError;
          }
        }
        this.logger.error(
          `E155010 循环修复耗尽重试次数，已修复 ${repairedCount} 个路径`
        );
      } else if (error.message.includes('E200009')) {
        this.logger.warn(`E200009 提交失败，尝试 cleanup + update 后重试...`);

        const retryResult = await doRetry();
        if (retryResult) return retryResult;
      } else if (
        error.message.includes('E170013') ||
        error.message.includes('E180001')
      ) {
        this.logger.warn(
          `E170013/E180001 仓库连接失败，尝试修正工作副本 URL 后重试...`
        );
        await this.ensureWorkingCopyUrl();
        const retryResult = await doRetry();
        if (retryResult) return retryResult;
      }

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

  async commitFiles(
    filePaths: string[],
    message: string
  ): Promise<CommitResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化，跳过提交');
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
    }

    if (filePaths.length === 0) {
      return {
        success: true,
        message:
          this.i18nService.t('error.version_control.no_files_to_commit') ??
          '没有文件需要提交',
      };
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
      const result = await mxCommitAsync(allPaths, message, false, null, null);

      this.logger.log(`批量提交成功: ${filePaths.length} 个文件`);
      this.logger.debug(`[MX_COMMIT 原始输出] ${result}`);
      return {
        success: true,
        message: this.i18nService.t('success.submitted') ?? '提交成功',
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
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
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
        message: this.i18nService.t('success.submitted') ?? '提交成功',
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
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
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
        message: this.i18nService.t('success.deleted') ?? '删除成功',
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

  async getFileHistory(
    filePath: string,
    limit?: number
  ): Promise<HistoryResult> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      this.logger.warn('MX 未初始化');
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
        entries: [],
        totalCount: 0,
      };
    }

    try {
      const storagePath = FileUtils.stripStoragePrefix(filePath);
      // 绝对路径输入先相对化，保证 split 后 pathParts 干净
      const relativePath = path.isAbsolute(storagePath)
        ? path.relative(this.filesDataPath, storagePath)
        : storagePath;

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
        `[MX] 获取目录历史 - 原始路径: ${filePath}, 目录路径: ${directoryPath}, 仓库URL: ${repoUrl}`
      );

      const xmlResult = await mxLogAsync(
        repoUrl,
        MxVersionControlProvider.FULL_HISTORY_FETCH_LIMIT,
        true,
        null,
        null
      );

      this.logger.debug(`[MX_LOG 原始XML] ${xmlResult || '(空)'}`);

      // MX log 返回顺序为版本从新到旧，反转成从旧到新（r0 初始在前，最后一次修改在后）
      const entries = this.parseMxLogXml(xmlResult || '', true);
      const totalCount = entries.length;
      entries.reverse();

      try {
        const absPath = FileUtils.resolveStoragePath(
          filePath,
          this.filesDataPath
        );
        if (fs.existsSync(absPath)) {
          const stats = fs.statSync(absPath);
          entries.unshift({
            revision: MxVersionControlProvider.INITIAL_VERSION_REVISION,
            author:
              this.i18nService.t('error.version_control.initial_version') ??
              '初始',
            date: stats.mtime,
            message:
              this.i18nService.t('error.version_control.initial_version') ??
              '初始',
          });
        }
      } catch {
        // ignore
      }

      // 保留初始版本占位（如存在）+ 最近 effectiveLimit 条修改，编号以 totalCount 为准
      const effectiveLimit =
        limit ?? MxVersionControlProvider.DEFAULT_HISTORY_LIMIT;
      if (effectiveLimit > 0 && totalCount > effectiveLimit) {
        const keepStart =
          entries[0]?.revision ===
          MxVersionControlProvider.INITIAL_VERSION_REVISION
            ? 1
            : 0;
        entries.splice(keepStart, totalCount - effectiveLimit);
      }

      this.logger.log(
        `获取目录历史成功: ${directoryPath}, 共 ${entries.length} 条记录（总修改 ${totalCount} 次）`
      );
      return {
        success: true,
        message: this.i18nService.t('success.fetched') ?? '获取成功',
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
          // rawMessage 不是合法 JSON 时回退使用原文
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
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
    }

    try {
      const storagePath = FileUtils.stripStoragePrefix(directoryPath);
      // 绝对路径输入先相对化，filesData/ 前缀相对路径也在此收敛
      const relativePath = path.isAbsolute(storagePath)
        ? path.relative(this.filesDataPath, storagePath)
        : storagePath;
      const repoUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}/${relativePath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[MX] 列出目录内容 - 目录: ${relativePath}, 版本: r${revision}, URL: ${repoUrl}`
      );

      const result = await mxListAsync(
        repoUrl,
        false,
        Number(revision),
        null,
        null
      );

      const files = result
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      this.logger.log(
        `列出目录内容成功: ${relativePath} @ r${revision}, 文件数: ${files.length}`
      );
      return {
        success: true,
        message: this.i18nService.t('success.fetched') ?? '获取成功',
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
      return {
        success: false,
        message:
          this.i18nService.t('error.version_control.mx_not_initialized') ??
          'MX 未初始化',
      };
    }

    try {
      // resolveStoragePath 兼容绝对/相对/带 filesData/ 或 /mxcad/file/ 前缀的路径，
      // path.resolve 遇绝对路径直接采用，避免双重拼接 filesDataPath（如 data/files/data/files/...）
      const targetPath = FileUtils.resolveStoragePath(
        filePath,
        this.filesDataPath
      );

      const contentStr = await mxCatAsync(
        targetPath,
        Number(revision),
        null,
        null
      );
      const content = Buffer.from(contentStr);

      if (!content || content.length === 0) {
        this.logger.error(
          `获取文件内容失败: ${filePath} @ r${revision}, 内容为空`
        );
        return {
          success: false,
          message:
            this.i18nService.t(
              'error.version_control.fetch_failed_content_empty'
            ) ?? '获取失败: 文件内容为空',
        };
      }

      this.logger.log(
        `获取文件内容成功: ${filePath} @ r${revision}, 大小: ${content.length} 字节`
      );
      return {
        success: true,
        message: this.i18nService.t('success.fetched') ?? '获取成功',
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

  private async getWorkingCopyUrl(): Promise<string | null> {
    try {
      const stdout = await mxInfoAsync(this.filesDataPath, null, null);
      const urlMatch = (stdout || '').match(/^URL:\s*(.+)$/m);
      return urlMatch ? urlMatch[1].trim() : null;
    } catch (error) {
      this.logger.warn(`获取工作副本 URL 失败: ${error.message}`);
      return null;
    }
  }

  private async relocateWorkingCopy(
    currentUrl: string,
    expectedUrl: string
  ): Promise<boolean> {
    this.logger.log(
      `工作副本 URL 不匹配: ${currentUrl} -> ${expectedUrl}，正在修正...`
    );

    try {
      await mxSwitchAsync(
        currentUrl,
        expectedUrl,
        this.filesDataPath,
        null,
        null
      );
      this.logger.log('工作副本 URL 修正成功 (switch --relocate)');
      return true;
    } catch (switchError) {
      this.logger.warn(
        `switch --relocate 失败: ${switchError.message}，尝试 svn relocate...`
      );
    }

    try {
      await mxRelocateAsync(
        currentUrl,
        expectedUrl,
        this.filesDataPath,
        null,
        null
      );
      this.logger.log('工作副本 URL 修正成功 (relocate)');
      return true;
    } catch (relocateError) {
      if (
        relocateError.message.includes('E195009') ||
        relocateError.message.includes('has uuid')
      ) {
        this.logger.error(
          `工作副本 UUID 与当前仓库不匹配（历史数据警示），请勿重命名仓库或重建工作副本，否则会丢失提交历史。` +
            `当前工作副本仓库 UUID 与 ${expectedUrl} 不一致，需要人工确认旧仓库位置。`
        );
      } else {
        this.logger.error(`relocate 失败: ${relocateError.message}`);
      }
      return false;
    }
  }

  private async ensureWorkingCopyUrl(): Promise<boolean> {
    const expectedUrl = `file:///${this.mxRepoPath.replace(/\\/g, '/')}`;

    const currentUrl = await this.getWorkingCopyUrl();
    if (!currentUrl) {
      this.logger.warn('无法获取工作副本 URL，跳过 URL 检查');
      return false;
    }

    if (currentUrl === expectedUrl) {
      this.logger.debug(`工作副本 URL 正确: ${currentUrl}`);
      return true;
    }

    return this.relocateWorkingCopy(currentUrl, expectedUrl);
  }
}
