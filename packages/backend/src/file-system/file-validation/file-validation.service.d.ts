import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/app.config';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
export interface FileTypeConfig {
    extension: string;
    mimeType: string;
    maxSize: number;
    enabled: boolean;
    magicNumbers?: number[];
}
export declare class FileValidationService {
    private readonly configService;
    private readonly runtimeConfigService;
    private readonly logger;
    private readonly allowedExtensions;
    private readonly maxFilesPerUpload;
    private readonly blockedExtensions;
    private readonly configurableFileTypes;
    constructor(configService: ConfigService<AppConfig>, runtimeConfigService: RuntimeConfigService);
    /**
     * 获取最大文件大小（从运行时配置）
     * 返回值为字节
     */
    private getMaxFileSize;
    /**
     * 获取文件上传配置（供外部使用）
     */
    getFileUploadConfig(): Promise<{
        allowedExtensions: string[];
        maxFileSize: number;
        maxFilesPerUpload: number;
        blockedExtensions: string[];
    }>;
    /**
     * 验证文件类型
     * @param file 文件对象
     */
    validateFileType(file: Express.Multer.File): void;
    /**
     * 验证文件大小
     * @param file 文件对象
     */
    validateFileSize(file: Express.Multer.File): Promise<void>;
    /**
     * 验证文件魔数（Magic Number）
     * 增强版本：检查更多字节，支持多种魔数模式
     * @param filePath 文件路径
     * @param extension 文件扩展名
     */
    validateFileMagicNumber(filePath: string, extension: string): void;
    /**
     * 深度验证魔数
     * 支持多种匹配模式：精确匹配、前缀匹配、偏移匹配
     * @param fileHeader 文件头字节数组
     * @param magicNumbers 期望的魔数
     * @returns 是否匹配
     */
    private validateMagicNumberDeep;
    /**
     * 判断是否需要深度验证
     * @param extension 文件扩展名
     * @returns 是否需要深度验证
     */
    private needsDeepValidation;
    /**
     * 深度验证文件内容结构
     * @param buffer 文件内容缓冲区
     * @param extension 文件扩展名
     */
    private validateFileContentDeep;
    /**
     * 验证 DWG 文件结构
     * @param buffer 文件内容缓冲区
     */
    private validateDwgFileStructure;
    /**
     * 验证 DXF 文件结构
     * @param buffer 文件内容缓冲区
     */
    private validateDxfFileStructure;
    /**
     * 验证文件名安全性
     * @param filename 文件名
     */
    validateFilename(filename: string): void;
    /**
     * 清理文件名
     * 增强版本：增加更多安全检查
     * @param filename 原始文件名
     * @returns 清理后的安全文件名
     */
    sanitizeFilename(filename: string): string;
    /**
     * 验证清理后的文件名
     * @param filename 清理后的文件名
     */
    private validateSanitizedFilename;
    /**
     * 综合验证文件
     * @param file 文件对象
     */
    validateFile(file: Express.Multer.File): Promise<void>;
    /**
     * 综合验证文件（包含魔数验证）
     * @param filePath 文件路径
     * @param file 文件对象
     */
    validateFileWithMagicNumber(filePath: string, file: Express.Multer.File): Promise<void>;
    private getExpectedMimeType;
}
//# sourceMappingURL=file-validation.service.d.ts.map