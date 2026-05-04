import { ConfigService } from '@nestjs/config';
import * as fsSync from 'fs';
import { FontUploadTarget } from './dto/font.dto';
/**
 * 字体信息接口
 */
export interface FontInfo {
    name: string;
    size: number;
    extension: string;
    createdAt: Date;
    existsInBackend?: boolean;
    existsInFrontend?: boolean;
    creator?: string;
    updatedAt?: Date;
}
/**
 * 字体上传结果接口
 */
export interface FontUploadResult {
    message: string;
    font: FontInfo;
}
/**
 * 字体管理服务
 * 负责管理后端转换程序和前端的字体文件
 */
export declare class FontsService {
    private configService;
    private readonly logger;
    /** 后端转换程序字体目录 */
    private readonly backendFontsDir;
    /** 前端资源字体目录 */
    private readonly frontendFontsDir;
    /** 支持的字体文件扩展名 */
    private readonly allowedExtensions;
    /** 最大文件大小（10MB） */
    private readonly maxFileSize;
    constructor(configService: ConfigService);
    /**
     * 获取字体列表
     * @param location 指定返回的字体位置：'backend'、'frontend' 或不指定返回全部
     */
    getFonts(location?: 'backend' | 'frontend'): Promise<FontInfo[]>;
    /**
     * 上传字体文件
     */
    uploadFont(file: Express.Multer.File, target?: FontUploadTarget): Promise<FontUploadResult>;
    /**
     * 删除字体文件
     */
    deleteFont(fileName: string, target?: FontUploadTarget): Promise<{
        message: string;
    }>;
    /**
     * 下载字体文件
     */
    downloadFont(fileName: string, location: 'backend' | 'frontend'): Promise<{
        stream: fsSync.ReadStream;
        fileName: string;
    }>;
    /**
     * 从指定目录获取字体文件列表
     */
    private getFontsFromDirectory;
    /**
     * 验证字体文件
     */
    private validateFontFile;
    /**
     * 确保目录存在
     */
    private ensureDirectoriesExist;
}
//# sourceMappingURL=fonts.service.d.ts.map