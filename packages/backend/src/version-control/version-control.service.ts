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
import type { AppConfig } from '../config/app.config';
import { promisify } from 'util';
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
} from '@cloudcad/svn-version-tool';
import * as path from 'path';
import * as fs from 'fs';

// 将回调函数转换为 Promise
const svnCheckoutAsync = promisify(svnCheckout);
const svnAddAsync = promisify(svnAdd);
const svnCommitAsync = promisify(svnCommit);
const svnDeleteAsync = promisify(svnDelete);
const svnadminCreateAsync = promisify(svnadminCreate);
const svnImportAsync = promisify(svnImport);
const svnLogAsync = promisify(svnLog);
const svnCatAsync: (
  filePath: string,
  revision: number,
  username: string | null,
  password: string | null
) => Promise<Buffer> = promisify(svnCat) as any;
const svnListAsync = promisify(svnList) as (
  repoUrl: string,
  isRecursive: boolean,
  revision: number | null,
  username: string | null,
  password: string | null
) => Promise<string>;
const svnPropsetAsync = promisify(svnPropset);
const svnUpdateAsync = promisify(svnUpdate);

/**
 * SVN 操作结果
 */
interface SvnOperationResult {
  success: boolean;
  message: string;
  data?: string;
}

/**
 * SVN 提交记录条目
 */
export interface SvnLogEntry {
  revision: number;
  author: string;
  date: Date;
  message: string;
  userName?: string; // 提交用户名称（从提交信息中解析）
  paths?: SvnLogPath[];
}

/**
 * SVN 提交记录中的变更路径
 */
export interface SvnLogPath {
  action: 'A' | 'M' | 'D' | 'R';
  kind: 'file' | 'dir';
  path: string;
}

/**
 * 获取 SVN 提交历史的响应
 */
export interface SvnLogResponse {
  success: boolean;
  message: string;
  entries: SvnLogEntry[];
}

@Injectable()
export class VersionControlService implements OnModuleInit {
  private readonly logger = new Logger(VersionControlService.name);
  private readonly svnRepoPath: string;
  private readonly filesDataPath: string;
  private readonly svnIgnorePatterns: string[];
  private isInitialized = false;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    // 使用 NestJS 标准配置方式获取路径（configuration.ts 已解析为绝对路径）
    this.svnRepoPath = this.configService.get('svnRepoPath', { infer: true })!;
    this.filesDataPath = this.configService.get('filesDataPath', { infer: true })!;
    this.svnIgnorePatterns = this.configService.get('svn', { infer: true })?.ignorePatterns || [];

    this.logger.log(`SVN 仓库路径: ${this.svnRepoPath}`);
    this.logger.log(`filesData 路径: ${this.filesDataPath}`);
    this.logger.log(`SVN 忽略模式: ${this.svnIgnorePatterns.join(', ')}`);
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
    if (!fs.existsSync(svnDir)) {
      // filesData 不是工作副本，需要初始化
      const filesDataExists = fs.existsSync(this.filesDataPath);
      const filesDataIsEmpty =
        !filesDataExists || fs.readdirSync(this.filesDataPath).length === 0;

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
        } catch (error) {
          // 如果 import 失败（如文件已存在），记录警告但不抛出错误
          if (error.message && error.message.includes('E160020')) {
            this.logger.warn(`SVN 仓库已有数据，跳过 import`);
          } else {
            this.logger.error(`svn import 失败: ${error.message}`);
            throw error;
          }
        }

        try {
          // 使用 --force 强制 checkout 到非空目录
          // 这样会在现有文件上创建 .svn 目录，使其成为工作副本
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

    // 设置 svn:global-ignores 忽略模式
    // 每次启动都会重新设置，确保配置变更后能生效
    await this.setupGlobalIgnores();
  }

  /**
   * 设置 svn:global-ignores 忽略模式
   * 每次启动都会重新设置，覆盖之前的配置
   */
  private async setupGlobalIgnores(): Promise<void> {
    if (this.svnIgnorePatterns.length === 0) {
      this.logger.log('未配置 SVN 忽略模式，跳过设置');
      return;
    }

    try {
      // 先更新工作副本，避免 "out of date" 错误
      this.logger.log('更新 SVN 工作副本...');
      await svnUpdateAsync(this.filesDataPath, null, null);
      this.logger.log('SVN 工作副本更新成功');

      // 将忽略模式转换为换行分隔的字符串
      const ignoreValue = this.svnIgnorePatterns.join('\n');

      this.logger.log(
        `设置 svn:global-ignores: ${this.svnIgnorePatterns.join(', ')}`
      );

      // 设置 svn:global-ignores 属性
      await svnPropsetAsync(
        this.filesDataPath,
        'svn:global-ignores',
        ignoreValue
      );

      // 提交属性更改
      const commitMessage = JSON.stringify({
        type: 'update_ignores',
        message: 'Update global ignore patterns',
        patterns: this.svnIgnorePatterns,
        timestamp: new Date().toISOString(),
      });

      await svnCommitAsync([this.filesDataPath], commitMessage, false, null, null);
      this.logger.log('svn:global-ignores 设置成功并已提交');
    } catch (error) {
      // 如果提交失败（可能没有变更），仅记录警告
      this.logger.warn(`设置 svn:global-ignores 失败: ${error.message}`);
    }
  }

  /**
   * 提交节点目录到 SVN
   * 使用 svn:global-ignores 过滤文件，直接递归添加目录
   * @param nodeDirectory 节点目录路径
   * @param message 提交消息
   * @param userId 用户ID（可选）
   * @param userName 用户名称（可选）
   */
  async commitNodeDirectory(
    nodeDirectory: string,
    message: string,
    userId?: string,
    userName?: string
  ): Promise<SvnOperationResult> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      const filesDataRoot = this.filesDataPath;

      // 获取从 filesData 根目录到 nodeDirectory 的完整路径
      const relativePath = path.relative(filesDataRoot, nodeDirectory);
      const pathParts = relativePath.split(path.sep);

      // 逐层添加并提交所有目录（确保父目录已在版本控制中）
      let currentPath = filesDataRoot;
      for (let i = 0; i < pathParts.length; i++) {
        currentPath = path.join(currentPath, pathParts[i]);

        // 判断是否是目标目录（最后一层）
        const isTargetDirectory = i === pathParts.length - 1;

        if (isTargetDirectory) {
          // 目标目录：使用 --depth infinity 递归添加
          // svn:global-ignores 会自动过滤匹配的文件
          try {
            await svnAddAsync([currentPath], true); // true = depth infinity
            this.logger.log(`递归添加目录: ${currentPath}`);
          } catch (error) {
            // 忽略已存在的错误
            if (!error.message.includes('already under version control')) {
              this.logger.warn(
                `添加目录失败: ${currentPath}, 错误: ${error.message}`
              );
            }
          }
        } else {
          // 中间目录：只添加目录本身
          try {
            await svnAddAsync([currentPath], false);
          } catch (error) {
            if (!error.message.includes('already under version control')) {
              this.logger.warn(
                `添加中间目录失败: ${currentPath}, 错误: ${error.message}`
              );
            }
          }

          // 提交中间目录
          try {
            const commitMessage = JSON.stringify({
              type: 'add_directory',
              message: `Add directory: ${pathParts[i]}`,
              timestamp: new Date().toISOString(),
            });
            await svnCommitAsync([currentPath], commitMessage, false, null, null);
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

      // 构造 JSON 格式的提交消息
      const commitData = {
        type: 'file_operation',
        message: message,
        userId: userId || '',
        userName: userName || '',
        timestamp: new Date().toISOString(),
      };
      const fullMessage = JSON.stringify(commitData);

      // 提交目标目录（递归）
      const result = await svnCommitAsync(
        [nodeDirectory],
        fullMessage,
        true, // 递归提交
        null,
        null
      );

      this.logger.log(`目录提交成功: ${nodeDirectory}`);
      return {
        success: true,
        message: '提交成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录提交失败: ${nodeDirectory}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `提交失败: ${error.message}`,
      };
    }
  }

  /**
   * 批量提交文件到 SVN
   */
  async commitFiles(
    filePaths: string[],
    message: string
  ): Promise<SvnOperationResult> {
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

  /**
   * 检查 SVN 是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 删除节点目录从 SVN（仅标记删除，不提交）
   */
  async deleteNodeDirectory(
    nodeDirectory: string
  ): Promise<SvnOperationResult> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过删除');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      // 从 SVN 删除目录（仅标记删除）
      const result = await svnDeleteAsync(
        [nodeDirectory],
        true, // 递归删除
        true, // 保留本地文件（因为物理文件会在之后被删除）
        null,
        null
      );

      this.logger.log(`目录已从 SVN 标记删除: ${nodeDirectory}`);
      return {
        success: true,
        message: '删除成功',
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `目录从 SVN 标记删除失败: ${nodeDirectory}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `删除失败: ${error.message}`,
      };
    }
  }

  /**
   * 提交 SVN 工作副本中的更改（用于批量提交删除）
   */
  async commitWorkingCopy(message: string): Promise<SvnOperationResult> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化，跳过提交');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      // 提交工作副本中的所有更改
      const filesDataPath = this.filesDataPath;
      const result = await svnCommitAsync(
        [filesDataPath],
        message,
        true, // 递归提交
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

  /**
   * 获取节点的 SVN 提交历史（获取目录历史而非具体文件历史）
   */
  async getFileHistory(
    filePath: string,
    limit?: number
  ): Promise<SvnLogResponse> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化', entries: [] };
    }

    try {
      // filePath 是相对于 filesData 的相对路径（如 filesData/202602/nodeId/file.dwg.mxweb 或 202602/nodeId/file.dwg.mxweb）
      // 需要去掉前缀 'filesData/' 然后提取目录路径
      let relativePath = filePath;
      if (filePath.startsWith('filesData/')) {
        relativePath = filePath.slice('filesData/'.length);
      }

      // 从文件路径中提取目录路径
      // 例如：202602/nodeId/file.dwg.mxweb -> 202602/nodeId
      // 如果传入的已经是目录路径（不以文件结尾），则直接使用
      const pathParts = relativePath.split('/').filter(Boolean);
      let directoryPath: string;

      // 判断最后一个部分是否是文件（有扩展名）
      const lastPart = pathParts[pathParts.length - 1] || '';
      const hasExtension = lastPart.includes('.') && !lastPart.startsWith('.');

      if (hasExtension && pathParts.length > 1) {
        // 是文件路径，提取目录部分
        directoryPath = pathParts.slice(0, -1).join('/');
      } else {
        // 已经是目录路径
        directoryPath = relativePath;
      }

      // 使用仓库 URL 而非工作副本路径，确保能获取到所有版本
      // 工作副本可能没有更新到最新版本，导致查询不到最新的提交历史
      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}/${directoryPath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[SVN] 获取目录历史 - 原始路径: ${filePath}, 目录路径: ${directoryPath}, 仓库URL: ${repoUrl}`
      );

      // 调用 svn log 命令获取目录的提交历史
      const xmlResult = await svnLogAsync(
        repoUrl,
        limit || 50, // 默认返回 50 条记录
        true, // 详细模式，显示变更的文件列表
        null,
        null
      );

      // 解析 XML 结果
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
        `获取目录历史失败: ${filePath}, 错误: ${error.message}`
      );
      return {
        success: false,
        message: `获取失败: ${error.message}`,
        entries: [],
      };
    }
  }

  /**
   * 解析 SVN log XML 输出
   */
  private parseSvnLogXml(xmlString: string): SvnLogEntry[] {
    const entries: SvnLogEntry[] = [];

    // 简单的 XML 解析器
    const logEntryRegex =
      /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g;
    let match;

    while ((match = logEntryRegex.exec(xmlString)) !== null) {
      const revision = parseInt(match[1], 10);
      const content = match[2];

      // 提取作者
      const authorMatch = /<author>(.*?)<\/author>/.exec(content);
      const author = authorMatch ? this.decodeXmlEntities(authorMatch[1]) : '';

      // 提取日期
      const dateMatch = /<date>(.*?)<\/date>/.exec(content);
      const date = dateMatch ? new Date(dateMatch[1]) : new Date();

      // 提取提交消息（JSON 格式）
      const msgMatch = /<msg>(.*?)<\/msg>/s.exec(content);
      const rawMessage = msgMatch?.[1]
        ? this.decodeXmlEntities(msgMatch[1])
        : '';

      // 解析 JSON 格式的提交消息 - 简化逻辑，直接提取字段，不区分类型
      let message = rawMessage;
      let userName: string | undefined;

      if (rawMessage) {
        try {
          const commitData = JSON.parse(rawMessage);
          // 直接提取 message 和 userName，不区分 type
          message = commitData.message || rawMessage;
          userName = commitData.userName;
        } catch {
          // JSON 解析失败，使用原始消息
        }
      }

      // 提取变更路径
      const paths: SvnLogPath[] = [];
      const pathsMatch = /<paths>([\s\S]*?)<\/paths>/.exec(content);
      if (pathsMatch) {
        // 修复正则表达式以匹配 SVN 实际输出的 XML 格式
        // SVN 输出格式: <path action="A" kind="dir" ...>/.lock</path>
        // 属性顺序可能变化，使用更灵活的正则
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

  /**
   * 解码 XML 实体字符
   */
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

    // 先解码数字实体 &#10; &#13; 等
    let decoded = str.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // 再解码十六进制实体 &#x...;
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // 最后解码命名实体 &lt; &gt; 等
    for (const [entity, char] of Object.entries(entityMap)) {
      decoded = decoded.replace(
        new RegExp(entity.replace('(', '\\(').replace(')', '\\)'), 'g'),
        char
      );
    }

    return decoded;
  }

  /**
   * 列出指定版本的目录内容
   * @param directoryPath 目录路径
   * @param revision 版本号
   * @returns 文件列表
   */
  async listDirectoryAtRevision(
    directoryPath: string,
    revision: number
  ): Promise<{ success: boolean; message: string; files?: string[] }> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      // 获取目录相对于 filesData 的路径
      const relativePath =
        path.relative(this.filesDataPath, directoryPath) || directoryPath;

      // 使用仓库 URL（确保路径使用正斜杠）
      const repoUrl = `file:///${this.svnRepoPath.replace(/\\/g, '/')}/${relativePath.replace(/\\/g, '/')}`;

      this.logger.log(
        `[SVN] 列出目录内容 - 目录: ${relativePath}, 版本: r${revision}, URL: ${repoUrl}`
      );

      // 调用 svn list 命令
      const result = await svnListAsync(repoUrl, false, revision, null, null);

      // 解析结果，每行一个文件名
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

  /**
   * 获取指定版本的文件内容
   */
  async getFileContentAtRevision(
    filePath: string,
    revision: number
  ): Promise<{ success: boolean; message: string; content?: Buffer }> {
    if (!this.isInitialized) {
      this.logger.warn('SVN 未初始化');
      return { success: false, message: 'SVN 未初始化' };
    }

    try {
      // 获取文件相对于 filesData 的路径
      const relativePath =
        path.relative(this.filesDataPath, filePath) || filePath;
      const targetPath = path.join(this.filesDataPath, relativePath);

      // 调用 svn cat 命令获取指定版本的文件内容（返回 Buffer）
      const content = await svnCatAsync(targetPath, revision, null, null);

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
}
