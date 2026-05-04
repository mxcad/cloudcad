/**
 * 文件类型检测工具
 */
export declare class FileTypeDetector {
    /**
     * CAD文件扩展名
     */
    private static readonly CAD_EXTENSIONS;
    /**
     * MXWeb文件扩展名
     */
    private static readonly MXWEB_EXTENSION;
    /**
     * 图片文件扩展名
     */
    private static readonly IMAGE_EXTENSIONS;
    /**
     * 文档文件扩展名
     */
    private static readonly DOCUMENT_EXTENSIONS;
    /**
     * 压缩文件扩展名
     */
    private static readonly ARCHIVE_EXTENSIONS;
    /**
     * 检查是否为CAD文件
     * @param fileName 文件名
     * @returns 是否为CAD文件
     */
    static isCadFile(fileName: string): boolean;
    /**
     * 检查是否为MXWeb文件
     * @param fileName 文件名
     * @returns 是否为MXWeb文件
     */
    static isMxwebFile(fileName: string): boolean;
    /**
     * 检查是否为图片文件
     * @param fileName 文件名
     * @returns 是否为图片文件
     */
    static isImageFile(fileName: string): boolean;
    /**
     * 检查是否为文档文件
     * @param fileName 文件名
     * @returns 是否为文档文件
     */
    static isDocumentFile(fileName: string): boolean;
    /**
     * 检查是否为压缩文件
     * @param fileName 文件名
     * @returns 是否为压缩文件
     */
    static isArchiveFile(fileName: string): boolean;
    /**
     * 检查是否需要转换（CAD文件）
     * @param fileName 文件名
     * @returns 是否需要转换
     */
    static needsConversion(fileName: string): boolean;
    /**
     * 检查是否可以直接上传（非CAD文件）
     * @param fileName 文件名
     * @returns 是否可以直接上传
     */
    static canDirectUpload(fileName: string): boolean;
    /**
     * 获取文件类型分类
     * @param fileName 文件名
     * @returns 文件类型分类
     */
    static getFileCategory(fileName: string): 'cad' | 'image' | 'document' | 'archive' | 'other';
    /**
     * 获取文件扩展名（小写）
     * @param fileName 文件名
     * @returns 文件扩展名
     */
    private static getFileExtension;
    /**
     * 获取支持的文件扩展名列表
     * @returns 支持的文件扩展名列表
     */
    static getSupportedExtensions(): string[];
    /**
     * 检查文件是否支持
     * @param fileName 文件名
     * @returns 是否支持
     */
    static isSupported(fileName: string): boolean;
}
//# sourceMappingURL=file-type-detector.d.ts.map