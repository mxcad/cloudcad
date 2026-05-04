/**
 * 文件操作工具类
 * 提供文件和目录的常用操作方法
 */
export declare class FileUtils {
    private static readonly logger;
    /**
     * 复制文件
     * @param source 源文件路径
     * @param target 目标文件路径
     * @returns 操作是否成功
     */
    static copyFile(source: string, target: string): Promise<boolean>;
    /**
     * 复制目录（递归）
     * @param source 源目录路径
     * @param target 目标目录路径
     * @returns 操作是否成功
     */
    static copyDirectory(source: string, target: string): Promise<boolean>;
    /**
     * 获取目录中指定前缀的所有文件
     * @param dir 目录路径
     * @param prefix 文件名前缀
     * @returns 文件路径列表
     */
    static getFilesByPrefix(dir: string, prefix: string): Promise<string[]>;
    /**
     * 确保目录存在，不存在则创建
     * @param dirPath 目录路径
     * @returns 操作是否成功
     */
    static ensureDirectory(dirPath: string): Promise<boolean>;
    /**
     * 检查路径是否存在
     * @param path 文件或目录路径
     * @returns 是否存在
     */
    static exists(filePath: string): Promise<boolean>;
    /**
     * 获取文件大小（字节）
     * @param filePath 文件路径
     * @returns 文件大小，获取失败返回 0
     */
    static getFileSize(filePath: string): Promise<number>;
    /**
     * 读取目录内容
     * @param dirPath 目录路径
     * @returns 目录项名称列表
     */
    static readDirectory(dirPath: string): Promise<string[]>;
    /**
     * 删除文件
     * @param filePath 文件路径
     * @returns 操作是否成功
     */
    static deleteFile(filePath: string): Promise<boolean>;
    /**
     * 删除目录（递归）
     * @param dirPath 目录路径
     * @returns 操作是否成功
     */
    static deleteDirectory(dirPath: string): Promise<boolean>;
    /**
     * 移动文件或目录
     * @param source 源路径
     * @param target 目标路径
     * @returns 操作是否成功
     */
    static move(source: string, target: string): Promise<boolean>;
    /**
     * 验证路径安全性，防止路径遍历攻击
     * @param inputPath 输入路径
     * @param baseDir 基础目录（用于验证路径是否在允许范围内）
     * @returns 验证通过后的安全路径
     * @throws Error 如果路径不安全
     */
    static validatePath(inputPath: string, baseDir?: string): string;
    /**
     * 验证文件名安全性
     * @param filename 文件名
     * @returns 验证通过后的安全文件名
     * @throws Error 如果文件名不安全
     */
    static validateFilename(filename: string): string;
    /**
     * 清理文件名，移除或替换非法字符
     * @param filename 原始文件名
     * @returns 清理后的安全文件名
     */
    static sanitizeFilename(filename: string): string;
}
//# sourceMappingURL=file-utils.d.ts.map