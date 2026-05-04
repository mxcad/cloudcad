import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ThumbnailFormat } from './thumbnail-utils';
/**
 * 缩略图生成结果
 */
export interface ThumbnailGenerationResult {
    /** 是否成功 */
    success: boolean;
    /** 缩略图文件路径 */
    thumbnailPath?: string;
    /** 错误信息 */
    error?: string;
}
/**
 * 缩略图生成服务
 * 使用 MxWebDwg2Jpg.exe 将 mxweb 文件转换为 jpg 缩略图
 */
export declare class ThumbnailGenerationService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    /** MxWebDwg2Jpg.exe 路径 */
    private readonly dwg2JpgPath;
    /** 是否启用自动生成 */
    private readonly enabled;
    /** 缩略图宽度 */
    private readonly width;
    /** 缩略图高度 */
    private readonly height;
    /** 临时文件路径 */
    private readonly tempPath;
    /** 背景颜色 */
    private readonly backgroundColor;
    /** exe 是否可用 */
    private exeAvailable;
    constructor(configService: ConfigService);
    /**
     * 模块初始化时检查 exe 是否可用
     */
    onModuleInit(): Promise<void>;
    /**
     * 获取默认的 MxWebDwg2Jpg.exe 路径
     */
    private getDefaultDwg2JpgPath;
    /**
     * 检查缩略图生成功能是否可用
     * 需要：启用 + exe 可用 + Windows 平台
     */
    isEnabled(): boolean;
    /**
     * 从 CAD 文件生成缩略图
     * @param cadFilePath CAD 文件（dwg/dxf）的绝对路径
     * @param outputDir 输出目录
     * @param nodeId 节点 ID（用于日志）
     * @param outputFileName 输出文件名（默认 thumbnail.webp，按优先级查找）
     * @returns 生成结果
     */
    generateThumbnail(cadFilePath: string, outputDir: string, nodeId?: string, outputFileName?: string): Promise<ThumbnailGenerationResult>;
    /**
     * 检查指定目录是否已存在缩略图（按优先级查找 webp > jpg > png）
     * @param nodeDir 节点目录
     * @returns 是否存在
     */
    hasThumbnail(nodeDir: string): Promise<boolean>;
    /**
     * 获取缩略图路径（按优先级查找存在的缩略图）
     * @param nodeDir 节点目录
     * @returns 缩略图完整路径，如果不存在则返回默认 webp 路径
     */
    getThumbnailPath(nodeDir: string): string;
    /**
     * 查找节点目录中存在的缩略图（按优先级）
     * @param nodeDir 节点目录
     * @returns 找到的缩略图信息，未找到返回 null
     */
    findThumbnail(nodeDir: string): Promise<{
        path: string;
        fileName: string;
        format: ThumbnailFormat;
        mimeType: string;
    } | null>;
    /**
     * 获取配置的缩略图尺寸
     */
    getThumbnailSize(): {
        width: number;
        height: number;
    };
}
//# sourceMappingURL=thumbnail-generation.service.d.ts.map