import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
/**
 * 文件扩展名服务
 * 提供统一的文件扩展名判断功能，配置来自 ConfigService
 */
export declare class FileExtensionsService {
    private readonly configService;
    private readonly config;
    constructor(configService: ConfigService<AppConfig>);
    /** 获取 CAD 文件扩展名列表 */
    get cadExtensions(): string[];
    /** 获取图片文件扩展名列表 */
    get imageExtensions(): string[];
    /** 获取文档文件扩展名列表 */
    get documentExtensions(): string[];
    /** 获取压缩文件扩展名列表 */
    get archiveExtensions(): string[];
    /** 获取字体文件扩展名列表 */
    get fontExtensions(): string[];
    /** 获取禁止上传的扩展名列表 */
    get forbiddenExtensions(): string[];
    /** 获取所有支持的扩展名 */
    get allSupported(): string[];
    /**
     * 获取文件扩展名（小写）
     */
    private getExtension;
    /** 检查是否为 CAD 文件 */
    isCadFile(fileName: string): boolean;
    /** 检查是否为图片文件 */
    isImageFile(fileName: string): boolean;
    /** 检查是否为文档文件 */
    isDocumentFile(fileName: string): boolean;
    /** 检查是否为压缩文件 */
    isArchiveFile(fileName: string): boolean;
    /** 检查是否为字体文件 */
    isFontFile(fileName: string): boolean;
    /** 检查是否为禁止的文件类型 */
    isForbidden(fileName: string): boolean;
    /** 检查文件是否支持 */
    isSupported(fileName: string): boolean;
    /** 获取文件类型分类 */
    getFileCategory(fileName: string): 'cad' | 'image' | 'document' | 'archive' | 'font' | 'forbidden' | 'other';
    /** 检查是否需要 MxCAD 转换 */
    needsConversion(fileName: string): boolean;
}
//# sourceMappingURL=file-extensions.service.d.ts.map