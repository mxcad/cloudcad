import { ConfigService } from '@nestjs/config';
import { FileUploadManagerFacadeService } from './services/file-upload-manager-facade.service';
import { FileSystemNodeService } from './node/filesystem-node.service';
import { FileConversionService } from './services/file-conversion.service';
import { ExternalReferenceUpdateService } from './services/external-reference-update.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { VersionControlService } from '../version-control/version-control.service';
import { DatabaseService } from '../database/database.service';
import { PreloadingDataDto } from './dto/preloading-data.dto';
import { ExternalReferenceStats } from './types/external-reference.types';
import { MxCadContext, ConvertServerFileParam } from './types/mxcad-context.types';
import { Request } from 'express';
import { AppConfig } from '../config/app.config';
export declare class MxCadService {
    private readonly configService;
    private readonly fileUploadManager;
    private readonly fileSystemNodeService;
    private readonly fileConversionService;
    private readonly externalReferenceUpdateService;
    private readonly storageManager;
    private readonly versionControlService;
    private readonly prisma;
    private readonly logger;
    private readonly mxcadUploadPath;
    constructor(configService: ConfigService<AppConfig>, fileUploadManager: FileUploadManagerFacadeService, fileSystemNodeService: FileSystemNodeService, fileConversionService: FileConversionService, externalReferenceUpdateService: ExternalReferenceUpdateService, storageManager: StorageManager, versionControlService: VersionControlService, prisma: DatabaseService);
    /**
     * 检查分片是否存在
     */
    checkChunkExist(chunk: number, fileHash: string, size: number, chunks: number, fileName: string, context?: MxCadContext): Promise<{
        ret: string;
    }>;
    /**
     * 检查文件是否存在
     */
    checkFileExist(filename: string, fileHash: string, context?: MxCadContext): Promise<{
        ret: string;
    }>;
    /**
     * 检查目录中是否存在重复文件（相同文件名和hash）
     * @param filename 文件名
     * @param fileHash 文件hash
     * @param nodeId 目标目录节点ID
     * @param currentFileId 当前文件ID（可选，用于排除当前文件）
     * @returns 重复文件信息，如果存在
     */
    checkDuplicateFile(filename: string, fileHash: string, nodeId: string, currentFileId?: string): Promise<{
        isDuplicate: boolean;
        existingNodeId?: string;
        existingFileName?: string;
    }>;
    /**
     * 上传分片文件
     */
    uploadChunk(hash: string, name: string, size: number, chunk: number, chunks: number, context?: MxCadContext): Promise<{
        ret: string;
        tz?: boolean;
    }>;
    /**
     * 上传完整文件并转换
     */
    uploadAndConvertFile(filePath: string, hash: string, name: string, size: number): Promise<{
        ret: string;
        tz?: boolean;
    }>;
    /**
     * 转换服务器文件
     */
    convertServerFile(param: ConvertServerFileParam): Promise<unknown>;
    /**
     * 检查图纸状态
     */
    checkTzStatus(fileHash: string): Promise<{
        code: number;
    }>;
    /**
     * 获取外部参照预加载数据
     * @param nodeId 文件系统节点 ID 或文件哈希值（兼容旧版本）
     * @returns 预加载数据，如果文件不存在则返回 null
     */
    getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null>;
    /**
     * 检查外部参照文件是否存在
     * @param nodeId 源图纸文件的节点 ID
     * @param fileName 外部参照文件名
     * @returns 文件是否存在
     */
    checkExternalReferenceExists(nodeId: string, fileName: string): Promise<boolean>;
    /**
     * 为 MxCAD-App 推断上下文信息
     */
    inferContextForMxCadApp(fileHash: string, request: Request): Promise<import('./node/filesystem-node.service').FileSystemNodeContext | null>;
    /**
     * 上传分片文件方法
     * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
     */
    uploadChunkWithPermission(hash: string, name: string, size: number, chunk: number, chunks: number, context?: MxCadContext): Promise<{
        ret: string;
        tz?: boolean;
        nodeId?: string;
    }>;
    /**
     * 合并分片文件方法（用于完成请求）
     * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
     */
    mergeChunksWithPermission(hash: string, name: string, size: number, chunks: number, context?: MxCadContext, srcDwgNodeId?: string): Promise<{
        ret: string;
        tz?: boolean;
        nodeId?: string;
    }>;
    /**
     * 上传完整文件方法
     * 注意：权限验证已在 Controller 层通过 @RequireProjectPermission 装饰器处理
     */
    uploadAndConvertFileWithPermission(filePath: string, hash: string, name: string, size: number, context?: MxCadContext): Promise<{
        ret: string;
        tz?: boolean;
        nodeId?: string;
    }>;
    /**
     * 公共日志方法，供其他模块使用
     */
    logError(message: string, error?: unknown): void;
    logInfo(message: string): void;
    logWarn(message: string): void;
    /**
     * 验证和标准化上下文
     */
    private validateContext;
    /**
     * 获取外部参照统计信息
     * @param nodeId 文件系统节点 ID
     * @returns 外部参照统计信息
     */
    getExternalReferenceStats(nodeId: string): Promise<ExternalReferenceStats>;
    /**
     * 更新文件节点的外部参照信息
     * @param nodeId 文件系统节点 ID
     * @param stats 外部参照统计信息
     */
    updateExternalReferenceInfo(nodeId: string, stats: ExternalReferenceStats): Promise<void>;
    /**
     * 上传完成后更新外部参照信息
     * @param nodeId 文件系统节点 ID
     */
    updateExternalReferenceAfterUpload(nodeId: string): Promise<void>;
    /**
     * 处理外部参照图片上传（公开方法）
     */
    handleExternalReferenceImage(fileHash: string, srcDwgNodeId: string, extRefFileName: string, srcFilePath: string, context: MxCadContext): Promise<void>;
    /**
     * 处理外部参照 DWG 上传（公开方法）
     */
    handleExternalReferenceFile(extRefHash: string, srcDwgFileHash: string, extRefFileName: string, srcFilePath: string): Promise<void>;
    /**
     * 创建默认上下文（用于没有上下文的操作）
     */
    private createDefaultContext;
    /**
     * 验证文件路径安全性，防止路径遍历攻击
     */
    private validateFilePath;
    /**
     * 验证预加载数据文件名合法性
     */
    private isValidPreloadingFileName;
    /**
     * 根据存储路径查找文件节点（用于路径转换）
     * @param storagePath 本地存储路径
     * @returns 文件节点或 null
     */
    getFileSystemNodeByPath(storagePath: string): Promise<any | null>;
    /**
     * 根据节点 ID 查找文件节点
     * @param nodeId 文件系统节点 ID
     * @returns 文件节点或 null
     */
    getFileSystemNodeByNodeId(nodeId: string): Promise<any | null>;
    /**
     * 查询缩略图是否存在
     * @param nodeId 节点 ID
     * @returns 缩略图信息（是否存在、存储位置、文件名）
     */
    checkThumbnailExists(nodeId: string): Promise<{
        exists: boolean;
        location: 'local' | 'none';
        fileName?: string;
        mimeType?: string;
    }>;
    /**
     * 上传缩略图
     * @param nodeId 节点 ID
     * @param filePath 上传的缩略图文件路径
     * @returns 上传结果
     */
    uploadThumbnail(nodeId: string, filePath: string): Promise<{
        success: boolean;
        message: string;
        fileName?: string;
    }>;
    /**
     * 根据文件扩展名获取 MIME 类型
     * @param ext 文件扩展名（包含点号，如 .png）
     * @returns MIME 类型
     */
    private getMimeType;
    /**
     * 保存 mxweb 文件到指定节点
     * @param nodeId 节点 ID
     * @param file 上传的 mxweb 文件
     * @param userId 用户 ID（可选）
     * @param userName 用户名称（可选）
     * @param commitMessage 提交信息（可选）
     * @param skipBinGeneration 是否跳过生成 bin 文件（公开资源库使用）
     * @returns 保存结果
     */
    saveMxwebFile(nodeId: string, file: Express.Multer.File, userId?: string, userName?: string, commitMessage?: string, skipBinGeneration?: boolean): Promise<{
        success: boolean;
        message: string;
        path?: string;
    }>;
    /**
     * 调用 mxcadassembly 生成 bin 文件
     * @param mxwebPath mxweb 文件完整路径
     * @param nodeName 节点名称（用于日志）
     */
    generateBinFiles(mxwebPath: string, nodeName: string): Promise<void>;
}
//# sourceMappingURL=mxcad.service.d.ts.map