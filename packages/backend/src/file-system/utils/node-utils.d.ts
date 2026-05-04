/**
 * 节点工具类
 * 提供文件名处理、MIME 类型检测、文件验证等纯逻辑工具方法
 * 不依赖数据库，只返回成功或失败结果
 */
export declare class NodeUtils {
    private static readonly SUPPORTED_EXTENSIONS;
    private static readonly MIME_TYPES;
    private static readonly RESERVED_NAMES;
    private static readonly INVALID_CHARS;
    private static readonly CONTROL_CHARS;
    private static readonly MAX_FILENAME_LENGTH;
    /**
     * 生成唯一的文件名（处理重复）
     * @param existingNames 已存在的文件名列表
     * @param originalName 原始文件名
     * @returns 唯一文件名
     */
    static generateUniqueFileName(existingNames: string[], originalName: string): string;
    /**
     * 从文件名解析文件哈希（SHA-256）
     * @param filename 文件名
     * @returns 文件哈希或 null
     */
    static parseFileHash(filename: string): string | null;
    /**
     * 获取文件的 MIME 类型
     * @param extension 文件扩展名（带或不带点）
     * @returns MIME 类型
     */
    static getMimeType(extension: string): string;
    /**
     * 验证文件名是否有效
     * @param filename 文件名
     * @returns 是否有效
     */
    static validateFileName(filename: string): boolean;
    /**
     * 清理文件名，移除非法字符
     * @param filename 原始文件名
     * @returns 清理后的文件名
     */
    static sanitizeFileName(filename: string): string;
    /**
     * 获取文件扩展名（带点）
     * @param filename 文件名
     * @returns 扩展名（如 ".dwg"）
     */
    static getExtension(filename: string): string;
    /**
     * 获取文件主名（不含扩展名）
     * @param filename 文件名
     * @returns 主文件名
     */
    static getBaseName(filename: string): string;
    /**
     * 检查是否为支持的文件类型
     * @param filename 文件名
     * @returns 是否支持
     */
    static isSupportedFileType(filename: string): boolean;
    /**
     * 检查是否为 CAD 文件
     * @param filename 文件名
     * @returns 是否为 CAD 文件
     */
    static isCADFile(filename: string): boolean;
    /**
     * 检查是否为图片文件
     * @param filename 文件名
     * @returns 是否为图片文件
     */
    static isImageFile(filename: string): boolean;
    /**
     * 检查是否为文档文件
     * @param filename 文件名
     * @returns 是否为文档文件
     */
    static isDocumentFile(filename: string): boolean;
    /**
     * 检查是否为 MxCAD 文件
     * @param filename 文件名
     * @returns 是否为 MxCAD 文件
     */
    static isMxCADFile(filename: string): boolean;
    /**
     * 标准化文件扩展名（确保以点开头且为小写）
     * @param extension 文件扩展名
     * @returns 标准化后的扩展名
     */
    static normalizeExtension(extension: string): string;
    /**
     * 格式化文件大小
     * @param bytes 字节数
     * @returns 格式化后的字符串
     */
    static formatFileSize(bytes: number): string;
    /**
     * 验证文件哈希格式（SHA-256）
     * @param fileHash 文件哈希
     * @returns 是否有效
     */
    static isValidFileHash(fileHash: string): boolean;
    /**
     * 从文件名构建安全的存储文件名
     * @param originalName 原始文件名
     * @param fileHash 文件哈希
     * @returns 存储文件名
     */
    static buildStorageFileName(originalName: string, fileHash: string): string;
    /**
     * 检查文件扩展名是否匹配
     * @param filename1 文件名1
     * @param filename2 文件名2
     * @returns 是否匹配
     */
    static isExtensionMatch(filename1: string, filename2: string): boolean;
}
//# sourceMappingURL=node-utils.d.ts.map