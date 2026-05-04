import { FileStatus } from '@prisma/client';
/**
 * 节点创建选项
 */
export interface CreateNodeOptions {
    /** 文件名 */
    name: string;
    /** 文件哈希值 */
    fileHash: string;
    /** 文件大小（字节） */
    size: number;
    /** MIME 类型 */
    mimeType: string;
    /** 文件扩展名 */
    extension: string;
    /** 父节点 ID */
    parentId: string;
    /** 所有者 ID */
    ownerId: string;
    /** 源文件路径（可选） */
    sourceFilePath?: string;
    /** 源目录路径（可选） */
    sourceDirectoryPath?: string;
    /** 是否跳过文件拷贝 */
    skipFileCopy?: boolean;
}
/**
 * 节点引用上下文
 */
export interface NodeReferenceContext {
    /** 节点 ID */
    nodeId: string;
    /** 节点名称 */
    nodeName: string;
    /** 文件哈希值 */
    fileHash: string;
    /** 所有者 ID */
    ownerId: string;
    /** 父节点 ID */
    parentId: string;
}
/**
 * 节点验证结果
 */
export interface NodeValidationResult {
    /** 是否有效 */
    isValid: boolean;
    /** 错误消息 */
    errorMessage?: string;
}
/**
 * 节点工具类
 * 提供节点创建、验证、引用等工具方法
 */
export declare class NodeUtils {
    private static readonly logger;
    /**
     * 验证节点创建选项
     * @param options 创建选项
     * @returns 验证结果
     */
    static validateCreateOptions(options: CreateNodeOptions): NodeValidationResult;
    /**
     * 验证文件名是否有效
     * @param fileName 文件名
     * @returns 是否有效
     */
    static isValidFileName(fileName: string): boolean;
    /**
     * 验证文件哈希格式
     * @param fileHash 文件哈希
     * @returns 是否有效
     */
    static isValidFileHash(fileHash: string): boolean;
    /**
     * 生成节点唯一标识符
     * @param fileHash 文件哈希
     * @param ownerId 所有者 ID
     * @returns 唯一标识符
     */
    static generateNodeIdentifier(fileHash: string, ownerId: string): string;
    /**
     * 生成锁名称
     * @param type 锁类型
     * @param identifier 标识符
     * @returns 锁名称
     */
    static generateLockName(type: 'create' | 'reference' | 'upload', identifier: string): string;
    /**
     * 生成存储目录名称
     * @param nodeId 节点 ID
     * @param fileHash 文件哈希
     * @returns 存储目录名称
     */
    static generateStorageDirectoryName(nodeId: string, fileHash: string): string;
    /**
     * 检查节点状态是否允许操作
     * @param fileStatus 文件状态
     * @param operation 操作类型
     * @returns 是否允许
     */
    static canPerformOperation(fileStatus: FileStatus, operation: 'read' | 'write' | 'delete'): boolean;
    /**
     * 标准化文件扩展名
     * @param extension 文件扩展名
     * @returns 标准化后的扩展名
     */
    static normalizeExtension(extension: string): string;
    /**
     * 从文件名提取扩展名
     * @param fileName 文件名
     * @returns 扩展名
     */
    static extractExtension(fileName: string): string;
    /**
     * 从文件名提取主文件名（不含扩展名）
     * @param fileName 文件名
     * @returns 主文件名
     */
    static extractBaseName(fileName: string): string;
    /**
     * 生成唯一的文件名（处理重复）
     * @param baseName 基础文件名
     * @param extension 扩展名
     * @param existingNames 已存在的文件名列表
     * @returns 唯一文件名
     */
    static generateUniqueFileName(baseName: string, extension: string, existingNames: string[]): string;
    /**
     * 计算文件的相对路径
     * @param directory 目录（YYYYMM[/N]）
     * @param nodeId 节点 ID
     * @param fileName 文件名（可选）
     * @returns 相对路径
     */
    static buildRelativePath(directory: string, nodeId: string, fileName?: string): string;
    /**
     * 从相对路径提取节点 ID
     * @param relativePath 相对路径
     * @returns 节点 ID 或 null
     */
    static extractNodeIdFromPath(relativePath: string): string | null;
    /**
     * 检查是否为支持的 CAD 文件
     * @param extension 文件扩展名
     * @returns 是否支持
     */
    static isSupportedCADFile(extension: string): boolean;
    /**
     * 检查是否为支持的图片文件
     * @param extension 文件扩展名
     * @returns 是否支持
     */
    static isSupportedImageFile(extension: string): boolean;
    /**
     * 格式化文件大小
     * @param bytes 字节数
     * @returns 格式化后的字符串
     */
    static formatFileSize(bytes: number): string;
    /**
     * 记录节点创建日志
     * @param nodeId 节点 ID
     * @param name 文件名
     * @param fileHash 文件哈希
     * @param action 操作类型
     */
    static logNodeOperation(nodeId: string, name: string, fileHash: string, action: 'create' | 'reference' | 'delete'): void;
}
//# sourceMappingURL=node-utils.d.ts.map