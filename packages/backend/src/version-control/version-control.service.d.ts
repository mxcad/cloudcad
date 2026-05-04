import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app.config';
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
    userName?: string;
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
export declare class VersionControlService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private readonly svnRepoPath;
    private readonly filesDataPath;
    private readonly svnIgnorePatterns;
    private isInitialized;
    private initPromise;
    constructor(configService: ConfigService<AppConfig>);
    /**
     * 模块初始化时异步设置 SVN 版本控制（不阻塞启动）
     */
    onModuleInit(): Promise<void>;
    /**
     * 确保 SVN 已初始化（供外部调用）
     * 如果还未初始化，会等待初始化完成
     */
    ensureInitialized(): Promise<void>;
    /**
     * 初始化 SVN 仓库
     */
    private initializeSvnRepository;
    /**
     * 检查是否是 SVN 锁定错误
     */
    private isSvnLockedError;
    /**
     * 执行 SVN 操作，遇到锁定错误时自动 cleanup 并重试
     */
    private executeWithLockRetry;
    /**
     * 设置 svn:global-ignores 忽略模式
     * 每次启动都会重新设置，覆盖之前的配置
     */
    private setupGlobalIgnores;
    /**
     * 递归收集目录下的所有文件路径
     */
    private collectFilePaths;
    /**
     * 提交节点目录到 SVN
     * 使用 svn:global-ignores 过滤文件，直接递归添加目录
     * @param nodeDirectory 节点目录路径
     * @param message 提交消息
     * @param userId 用户ID（可选）
     * @param userName 用户名称（可选）
     */
    commitNodeDirectory(nodeDirectory: string, message: string, userId?: string, userName?: string): Promise<SvnOperationResult>;
    /**
     * 批量提交文件到 SVN
     */
    commitFiles(filePaths: string[], message: string): Promise<SvnOperationResult>;
    /**
     * 检查 SVN 是否已初始化
     */
    isReady(): boolean;
    /**
     * 删除节点目录从 SVN（仅标记删除，不提交）
     */
    deleteNodeDirectory(nodeDirectory: string): Promise<SvnOperationResult>;
    /**
     * 提交 SVN 工作副本中的更改（用于批量提交删除）
     */
    commitWorkingCopy(message: string): Promise<SvnOperationResult>;
    /**
     * 获取节点的 SVN 提交历史（获取目录历史而非具体文件历史）
     */
    getFileHistory(filePath: string, limit?: number): Promise<SvnLogResponse>;
    /**
     * 解析 SVN log XML 输出
     */
    private parseSvnLogXml;
    /**
     * 解码 XML 实体字符
     */
    private decodeXmlEntities;
    /**
     * 列出指定版本的目录内容
     * @param directoryPath 目录路径
     * @param revision 版本号
     * @returns 文件列表
     */
    listDirectoryAtRevision(directoryPath: string, revision: number): Promise<{
        success: boolean;
        message: string;
        files?: string[];
    }>;
    /**
     * 获取指定版本的文件内容
     */
    getFileContentAtRevision(filePath: string, revision: number): Promise<{
        success: boolean;
        message: string;
        content?: Buffer;
    }>;
}
export {};
//# sourceMappingURL=version-control.service.d.ts.map