import type { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { MxCadService } from './mxcad.service';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import { UploadExtReferenceFileDto } from '../dto/upload-ext-reference-file.dto';
import { UploadFilesDto } from '../dto/upload-files.dto';
import { CheckFileExistDto } from '../dto/check-file-exist.dto';
import { CheckChunkExistDto } from '../dto/check-chunk-exist.dto';
import { CheckDuplicateFileDto } from '../dto/check-duplicate-file.dto';
import { SaveMxwebAsDto } from '../dto/save-mxweb-as.dto';
import { MxCadRequest } from '../types/request.types';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../storage/storage.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { IVersionControl } from '../../version-control/interfaces/version-control.interface';
import { AppConfig } from '../../config/app.config';
import { FileConversionService } from '../conversion/file-conversion.service';
import { SaveAsService } from '../save/save-as.service';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';
export declare class MxCadController {
    private readonly mxCadService;
    private readonly jwtService;
    private readonly configService;
    private readonly storageService;
    private readonly permissionService;
    private readonly versionControlService;
    private readonly fileConversionService;
    private readonly saveAsService;
    private readonly mxcadFileHandler;
    private readonly fileTreeService;
    private readonly logger;
    private readonly mxCadFileExt;
    private readonly cacheTTL;
    private preloadingDataCache;
    private historyConversionLocks;
    constructor(mxCadService: MxCadService, jwtService: JwtService, configService: ConfigService<AppConfig>, storageService: StorageService, permissionService: FileSystemPermissionService, versionControlService: IVersionControl, fileConversionService: FileConversionService, saveAsService: SaveAsService, mxcadFileHandler: MxcadFileHandlerService, fileTreeService: FileTreeService);
    /**
     * 检查分片是否存在
     */
    checkChunkExist(body: CheckChunkExistDto, request: MxCadRequest): Promise<{
        exists: boolean;
    }>;
    /**
     * 检查文件是否存在
     */
    checkFileExist(body: CheckFileExistDto, request: MxCadRequest): Promise<{
        exists: boolean;
        nodeId: string | undefined;
    }>;
    /**
     * 检查目录中是否存在重复文件（相同文件名和hash）
     */
    checkDuplicateFile(body: CheckDuplicateFileDto, request: MxCadRequest): Promise<{
        isDuplicate: boolean;
        existingNodeId?: string;
        existingFileName?: string;
    }>;
    /**
     * 获取外部参照预加载数据
     *
     * @param nodeId 节点 ID
     * @returns 预加载数据
     * @throws NotFoundException 预加载数据不存在时抛出异常
     */
    getPreloadingData(nodeId: string): Promise<PreloadingDataDto>;
    /**
     * 清理过期的缓存项
     */
    private cleanExpiredCache;
    /**
     * 检查外部参照文件是否存在
     *
     * @param nodeId 源图纸节点 ID
     * @param body 请求体，包含 fileName 字段
     * @returns 文件是否存在
     */
    checkExternalReference(nodeId: string, body: {
        fileName: string;
    }): Promise<{
        exists: boolean;
    }>;
    /**
     * 手动刷新文件的外部参照信息
     * @param nodeId 文件系统节点 ID
     * @returns 刷新结果
     */
    refreshExternalReferences(nodeId: string): Promise<{
        code: number;
        message: string;
        stats: import("../types/external-reference.types").ExternalReferenceStats;
    }>;
    /**
     * 上传文件（支持分片）
     *
     * 注意：RequireProjectPermissionGuard 现在通过 nodeId → 数据库查询解析项目 ID。
     * 对于 multipart 请求，客户端需确保 nodeId 可通过 query 参数传递，
     * 因为 Multer 在 Guard 之后才解析 request.body。
     */
    uploadFile(files: Express.Multer.File[], body: UploadFilesDto, request: MxCadRequest): Promise<{
        nodeId: string | undefined;
        tz: boolean | undefined;
        ret: string;
    }>;
    /**
     * 保存 mxweb 文件到指定节点
     * 路由: POST /api/mxcad/savemxweb/:nodeId
     */
    saveMxwebToNode(nodeId: string, file: Express.Multer.File, commitMessage: string, expectedTimestamp: string, request: MxCadRequest): Promise<{
        nodeId: string;
        path: string | undefined;
    }>;
    /**
     * 保存mxweb文件为新文件（Save As）
     * 路由: POST /api/mxcad/save-as
     */
    saveMxwebAs(file: Express.Multer.File, dto: SaveMxwebAsDto, request: MxCadRequest): Promise<import("../save/save-as.service").SaveMxwebAsResult>;
    /**
     * 上传外部参照 DWG
     *
     * 优化流程：先上传到临时目录，验证通过后直接移动到目标目录，避免转换后再拷贝。
     */
    uploadExtReferenceDwg(nodeId: string, file: Express.Multer.File, body: UploadExtReferenceFileDto, request: MxCadRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * 上传外部参照图片
     *
     * 图片不需要转换，直接拷贝到源图纸的 hash 目录。
     */
    uploadExtReferenceImage(file: Express.Multer.File, body: UploadExtReferenceFileDto, request: MxCadRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * 访问 filesData 目录中的文件
     * 支持访问路径: /mxcad/filesData/YYYYMM/nodeId/nodeId.dwg.mxweb
     * 从本地存储读取文件
     *
     * 需要登录认证，不允许公开访问
     *
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @returns 返回文件流或错误信息
     */
    getFilesDataFile(res: Response, req: Request): Promise<void | Response<any, Record<string, any>>>;
    /**
     * 访问 filesData 目录中的文件 - HEAD 方法
     * 用于获取文件信息而不下载文件内容
     * 注意：HEAD 请求公开访问，因为 MxCAD 库内部发送的 HEAD 请求无法自定义请求头
     * 实际的安全性由 GET 请求和文件路径的随机性保证
     *
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @returns 返回文件头信息或错误信息
     */
    getFilesDataFileHead(res: Response, req: Request): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 处理 filesData 目录的文件请求
     * @param filename 文件名
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @param isHeadRequest 是否为 HEAD 请求
     */
    private handleFilesDataFileRequest;
    /**
     * 处理历史版本文件请求
     * @param filename 文件路径
     * @param version 版本号
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @param isHeadRequest 是否为 HEAD 请求
     */
    private handleHistoricalVersionRequest;
    /**
     * 清理临时文件目录
     * @param tempDir 临时目录路径
     */
    private cleanupTempFiles;
    /**
     * 根据文件扩展名获取 MIME 类型
     * @param filePath 文件路径
     * @returns MIME 类型
     */
    private getContentType;
    /**
     * 访问转换后的文件 (.mxweb) - GET 方法
     * 支持 MxCAD-App 访问路径: /mxcad/file/{filename}
     * 从本地存储读取文件
     *
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @returns 返回文件流或错误信息
     */
    getFile(res: Response, req: MxCadRequest): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 访问转换后的文件 (.mxweb) - HEAD 方法
     * 用于获取文件信息而不下载文件内容
     *
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @returns 返回文件头信息或错误信息
     */
    getFileHead(res: Response, req: MxCadRequest): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 统一的文件请求处理方法
     * @param filename 文件名
     * @param res Express Response 对象
     * @param req Express Request 对象
     * @param isHeadRequest 是否为 HEAD 请求
     */
    private handleFileRequest;
    /**
     * 检查缩略图是否存在
     */
    checkThumbnail(nodeId: string, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * 上传缩略图
     */
    uploadThumbnail(nodeId: string, file: Express.Multer.File, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * 获取非 CAD 文件（图片、文档等）
     */
    getNonCadFile(storageKey: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    /**
     * 从请求中构建上下文信息，通过JWT验证用户身份
     * 强制要求JWT认证，确保安全性}
  
    /**
     * 从请求中构建上下文信息，通过JWT验证用户身份
     * 强制要求JWT认证，确保安全性
     */
    private buildContextFromRequest;
    /**
     * 验证 JWT token 并返回用户 ID（用于文件访问）
     * @param request Express Request 对象
     * @returns 用户 ID
     */
    private validateTokenAndGetUserId;
    /**
     * 获取项目中的所有节点ID（递归）
     * @param projectId 项目根目录ID
     * @returns 所有节点ID数组
     */
    private getAllNodeIdsInProject;
    /**
     * 通过文件哈希值查找 FileSystemNode
     * @param fileHash 文件哈希值
     * @param projectId 项目ID（可选，如果指定则只查找该项目中的节点）
     * @returns FileSystemNode 或 null
     */
    private getFileSystemNodeByHash;
    /**
     * 根据节点 ID 查找项目根目录
     * @param nodeId 节点 ID
     * @returns 项目根目录节点或 null
     */
    private getProjectRootByNodeId;
    /**
     * 检查用户是否有文件访问权限
     * @param nodeId 文件节点 ID
     * @param userId 用户 ID
     * @param checkUserId 要检查权限的用户 ID
     * @returns 是否有权限
     */
    private checkFileAccessPermission;
    /**
     * 验证文件名是否安全（防止路径遍历攻击）
     * @param fileName 文件名
     * @returns 是否安全
     */
    private validateFileName;
    /**
     * 验证文件大小是否在允许范围内
     * @param fileSize 文件大小（字节）
     * @param maxSize 最大文件大小（字节），默认 100MB
     * @returns 是否在允许范围内
     */
    private validateFileSize;
    /**
     * 验证文件类型是否允许
     * @param fileName 文件名
     * @param allowedExtensions 允许的文件扩展名列表
     * @returns 是否允许
     */
    private validateFileType;
    /**
     * 验证外部参照上传请求
     * @param file 上传的文件
     * @param body 请求体
     * @param methodPrefix 方法前缀（用于日志）
     * @param allowedExtensions 允许的文件扩展名列表
     * @returns 验证结果
     */
    private validateExtReferenceUpload;
}
//# sourceMappingURL=mxcad.controller.d.ts.map