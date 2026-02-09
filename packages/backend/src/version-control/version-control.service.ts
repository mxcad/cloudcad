import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promisify } from 'util';
import {
  svnCheckout,
  svnAdd,
  svnCommit,
  svnadminCreate,
  svnImport,
} from '@cloudcad/svn-version-tool';
import * as path from 'path';
import * as fs from 'fs';

// 将回调函数转换为 Promise
const svnCheckoutAsync = promisify(svnCheckout);
const svnAddAsync = promisify(svnAdd);
const svnCommitAsync = promisify(svnCommit);
const svnadminCreateAsync = promisify(svnadminCreate);
const svnImportAsync = promisify(svnImport);

/**
 * SVN 操作结果
 */
interface SvnOperationResult {
  success: boolean;
  message: string;
  data?: string;
}

@Injectable()
export class VersionControlService implements OnModuleInit {
  private readonly logger = new Logger(VersionControlService.name);
  private readonly svnRepoPath: string;
  private readonly filesDataPath: string;
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {
    // 解析路径为绝对路径
    const basePath = process.cwd();
    const repoPath = this.configService.get<string>('SVN_REPO_PATH') || '../svn-repo';
    const dataPath = this.configService.get<string>('FILES_DATA_PATH') || '../filesData';

    this.svnRepoPath = path.resolve(basePath, repoPath);
    this.filesDataPath = path.resolve(basePath, dataPath);

    this.logger.log(`SVN 仓库路径: ${this.svnRepoPath}`);
    this.logger.log(`filesData 路径: ${this.filesDataPath}`);
  }

  /**
   * 模块初始化时设置 SVN 版本控制
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.initializeSvnRepository();
    } catch (error) {
      this.logger.error(`SVN 初始化失败: ${error.message}`, error.stack);
      this.isInitialized = false;
    }
  }

  /**
   * 初始化 SVN 仓库
   */
  private async initializeSvnRepository(): Promise<void> {
    // 检查 SVN 仓库是否存在
    if (!fs.existsSync(this.svnRepoPath)) {
      this.logger.log(`创建 SVN 仓库: ${this.svnRepoPath}`);
      await svnadminCreateAsync(this.svnRepoPath);
      this.logger.log(`SVN 仓库创建成功`);
    } else {
      this.logger.log(`SVN 仓库已存在: ${this.svnRepoPath}`);
    }

    // 检查 filesData 是否已经是 SVN 工作副本
    const svnDir = path.join(this.filesDataPath, '.svn');
    if (fs.existsSync(svnDir)) {
      this.logger.log(`filesData 已是 SVN 工作副本`);
      this.isInitialized = true;
      this.logger.log('SVN 版本控制初始化完成');
      return;
    }

    // filesData 不是工作副本，需要初始化
    const filesDataExists = fs.existsSync(this.filesDataPath);
    const filesDataIsEmpty = !filesDataExists || fs.readdirSync(this.filesDataPath).length === 0;

    if (filesDataIsEmpty) {
      // 如果 filesData 为空，可以直接 checkout
      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}`;
      this.logger.log(`检出 SVN 仓库: ${repoUrl} -> ${this.filesDataPath}`);

      // 确保 filesData 目录存在
      if (!filesDataExists) {
        fs.mkdirSync(this.filesDataPath, { recursive: true });
      }

      await svnCheckoutAsync(repoUrl, this.filesDataPath, null, null);
      this.logger.log(`SVN 检出成功`);
    } else {
      // 如果 filesData 不为空，使用 svn import 导入到仓库
      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}`;
      this.logger.warn(`filesData 不为空，使用 svn import 导入现有内容...`);

      try {
        // 先 import 现有内容到仓库
        const importResult = await svnImportAsync(
          this.filesDataPath,
          repoUrl,
          'Initial import'
        );
        this.logger.log(`svn import 成功: ${importResult}`);

        // 然后删除 filesData 并重新 checkout
        this.logger.log(`删除 filesData 目录并重新检出...`);
        fs.rmSync(this.filesDataPath, { recursive: true, force: true });
        fs.mkdirSync(this.filesDataPath, { recursive: true });
        await svnCheckoutAsync(repoUrl, this.filesDataPath, null, null);
        this.logger.log(`SVN 检出成功`);
      } catch (error) {
        this.logger.error(`svn import 失败: ${error.message}`);
        throw error;
      }
    }

    this.isInitialized = true;
    this.logger.log('SVN 版本控制初始化完成');
  }

  /**
   * 提交节点目录到 SVN
   */
  async commitNodeDirectory(nodeDirectory: string, message: string): Promise<SvnOperationResult> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const filesDataRoot = this.filesDataPath;

      // 获取从 filesData 根目录到 nodeDirectory 的完整路径
      const relativePath = path.relative(filesDataRoot, nodeDirectory);
      const pathParts = relativePath.split(path.sep);

      // 逐层添加并提交所有目录
      let currentPath = filesDataRoot;
      for (let i = 0; i < pathParts.length; i++) {
        currentPath = path.join(currentPath, pathParts[i]);

        // 判断是否是目标目录（最后一层）
        const isTargetDirectory = (i === pathParts.length - 1);

        // 添加目录
        // 目标目录递归添加所有内容，中间目录只添加目录本身
        try {
          await svnAddAsync([currentPath], isTargetDirectory);
        } catch (error) {
          // 忽略已存在的错误
          if (!error.message.includes('already under version control')) {
            this.logger.warn(`添加目录失败: ${currentPath}, 错误: ${error.message}`);
          }
        }

        // 如果不是最后一层（目标目录），先提交这一层
        if (i < pathParts.length - 1) {
          try {
            const commitResult = await svnCommitAsync(
              [currentPath],
              `添加目录: ${pathParts[i]}`,
              false,
              null,
              null
            );
            this.logger.log(`目录提交成功: ${currentPath}`);
          } catch (error) {
            // 如果提交失败，可能目录没有变化，忽略
            if (!error.message.includes('not under version control')) {
              this.logger.warn(`提交目录失败: ${currentPath}, 错误: ${error.message}`);
            }
          }
        }
      }

      // 最后提交目标目录（递归提交所有内容）
      const result = await svnCommitAsync([nodeDirectory], message, true, null, null);

      this.logger.log(`目录提交成功: ${nodeDirectory}`);
      return {
        success: true,
        message: '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(`目录提交失败: ${nodeDirectory}, 错误: ${error.message}`);
      return {
        success: false,
        message: `提交失败: ${error.message}`,
      };
    }
  }

  /**
   * 批量提交文件到 SVN
   */
  async commitFiles(filePaths: string[], message: string): Promise<SvnOperationResult> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    if (filePaths.length === 0) {
      return { success: true, message: '没有文件需要提交' };
    }

    try {
      // 先添加文件（如果文件还未在版本控制中）
      await svnAddAsync(filePaths, false);

      // 提交文件
      const result = await svnCommitAsync(filePaths, message, false, null, null);

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

  /**
   * 检查 SVN 是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
