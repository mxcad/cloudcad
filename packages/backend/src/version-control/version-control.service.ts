import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const svnCatAsync: (filePath: string, revision: number, username: string | null, password: string | null) => Promise<Buffer> = promisify(svnCat) as any;

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
            const commitMessage = JSON.stringify({
              type: 'add_directory',
              message: `Add directory: ${pathParts[i]}`,
              timestamp: new Date().toISOString()
            });
            const commitResult = await svnCommitAsync(
              [currentPath],
              commitMessage,
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
      // 构造 JSON 格式的提交消息
      const commitData = {
        type: 'file_operation',
        message: message,
        userId: userId || '',
        userName: userName || '',
        timestamp: new Date().toISOString()
      };
      const fullMessage = JSON.stringify(commitData);

      this.logger.log(`[SVN] 准备提交 - 目录: ${nodeDirectory}, 消息: ${fullMessage}`);
      const result = await svnCommitAsync([nodeDirectory], fullMessage, true, null, null);

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

  /**
   * 删除节点目录从 SVN（仅标记删除，不提交）
   */
  async deleteNodeDirectory(nodeDirectory: string): Promise<SvnOperationResult> {
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
      this.logger.error(`目录从 SVN 标记删除失败: ${nodeDirectory}, 错误: ${error.message}`);
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
   * 获取文件的 SVN 提交历史
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
      // filePath 是相对于 filesData 的相对路径（如 filesData/202602/nodeId/file.dwg.mxweb）
      // 需要去掉前缀 'filesData/' 然后与 filesDataPath 拼接
      let relativePath = filePath;
      if (filePath.startsWith('filesData/')) {
        relativePath = filePath.slice('filesData/'.length);
      }
      const targetPath = path.join(this.filesDataPath, relativePath);

      this.logger.log(`[SVN] 获取文件历史 - 原始路径: ${filePath}, 相对路径: ${relativePath}, 完整路径: ${targetPath}`);

      // 调用 svn log 命令获取提交历史
      const xmlResult = await svnLogAsync(
        targetPath,
        limit || 50, // 默认返回 50 条记录
        true, // 详细模式，显示变更的文件列表
        null,
        null
      );

      // 解析 XML 结果
      const entries = this.parseSvnLogXml(xmlResult || '');

      this.logger.log(`获取文件历史成功: ${filePath}, 共 ${entries.length} 条记录`);
      return {
        success: true,
        message: '获取成功',
        entries,
      };
    } catch (error) {
      this.logger.error(`获取文件历史失败: ${filePath}, 错误: ${error.message}`);
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
    const logEntryRegex = /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g;
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
      const rawMessage = msgMatch?.[1] ? this.decodeXmlEntities(msgMatch[1]) : '';

      // 解析 JSON 格式的提交消息
      let message = rawMessage;
      let userName: string | undefined;
      let userId: string | undefined;

      if (rawMessage) {
        try {
          const commitData = JSON.parse(rawMessage);
          if (commitData.type === 'file_operation') {
            message = commitData.message || '';
            userName = commitData.userName;
            userId = commitData.userId;
          } else if (commitData.type === 'add_directory') {
            message = commitData.message || '';
          }
        } catch (e) {
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
        const pathRegex = /<path[^>]*action="([AMDR])"[^>]*kind="(file|dir)"[^>]*>(.*?)<\/path>/g;
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
      decoded = decoded.replace(new RegExp(entity.replace('(', '\\(').replace(')', '\\)'), 'g'), char);
    }

    return decoded;
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
      const relativePath = path.relative(this.filesDataPath, filePath) || filePath;
      const targetPath = path.join(this.filesDataPath, relativePath);

      // 调用 svn cat 命令获取指定版本的文件内容（返回 Buffer）
      const content = await svnCatAsync(targetPath, revision, null, null);

      if (!content) {
        this.logger.error(`获取文件内容失败: ${filePath} @ r${revision}, 内容为空`);
        return {
          success: false,
          message: '获取失败: 文件内容为空',
        };
      }

      this.logger.log(`获取文件内容成功: ${filePath} @ r${revision}, 大小: ${content.length} 字节`);
      return {
        success: true,
        message: '获取成功',
        content,
      };
    } catch (error) {
      this.logger.error(`获取文件内容失败: ${filePath} @ r${revision}, 错误: ${error.message}`);
      return {
        success: false,
        message: `获取失败: ${error.message}`,
      };
    }
  }
}
