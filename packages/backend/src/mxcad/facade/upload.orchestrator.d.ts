import { ChunkUploadService } from '../chunk/chunk-upload.service';
import { FileCheckService } from '../chunk/file-check.service';
import { NodeCreationService } from '../node/node-creation.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';
/**
 * 上传上下文
 */
export interface UploadContext {
    /** 节点 ID（项目根目录或文件夹） */
    nodeId: string;
    /** 用户 ID */
    userId: string;
    /** 用户角色 */
    userRole?: string;
    /** 外部参照上传时的源图纸节点 ID */
    srcDwgNodeId?: string;
    /** 是否为图片外部参照 */
    isImage?: boolean;
}
/**
 * 分片上传选项
 */
export interface HandleChunkUploadOptions {
    /** 文件哈希值 */
    hash: string;
    /** 分片索引 */
    chunk: number;
    /** 分片数据路径 */
    chunkData: string;
    /** 分片大小（字节） */
    size: number;
}
/**
 * 文件上传选项
 */
export interface HandleFileUploadOptions {
    /** 文件哈希值 */
    hash: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
    size: number;
    /** 总分片数 */
    chunks: number;
    /** MIME 类型 */
    mimeType?: string;
    /** 上传上下文 */
    context: UploadContext;
}
/**
 * 合并请求选项
 */
export interface HandleMergeRequestOptions {
    /** 文件哈希值 */
    hash: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
    size: number;
    /** 总分片数 */
    chunks: number;
    /** 上传上下文 */
    context: UploadContext;
}
/**
 * 分片存在检查选项
 */
export interface CheckChunkExistsOptions {
    /** 文件哈希值 */
    hash: string;
    /** 分片索引 */
    chunk: number;
}
/**
 * 上传结果
 */
export interface UploadResult {
    /** 是否成功 */
    success: boolean;
    /** 节点 ID（成功时） */
    nodeId?: string;
    /** 错误消息（失败时） */
    errorMessage?: string;
}
/**
 * 上传编排器
 *
 * 职责：
 * 1. 编排文件上传的完整流程
 * 2. 协调各个子服务的调用
 * 3. 处理上传流程中的异常
 * 4. 提供统一的上传接口
 */
export declare class UploadOrchestrator {
    private readonly chunkUploadService;
    private readonly fileCheckService;
    private readonly nodeCreationService;
    private readonly fileConversionService;
    private readonly concurrencyManager;
    private readonly logger;
    constructor(chunkUploadService: ChunkUploadService, fileCheckService: FileCheckService, nodeCreationService: NodeCreationService, fileConversionService: FileConversionService, concurrencyManager: ConcurrencyManager);
    /**
     * 处理分片上传
     *
     * @param options 分片上传选项
     * @returns 上传结果
     */
    handleChunkUpload(options: HandleChunkUploadOptions): Promise<UploadResult>;
    /**
     * 处理文件上传（非分片）
     *
     * @param options 文件上传选项
     * @returns 上传结果
     */
    handleFileUpload(options: HandleFileUploadOptions): Promise<UploadResult>;
    /**
     * 处理合并请求
     *
     * @param options 合并请求选项
     * @returns 上传结果
     */
    handleMergeRequest(options: HandleMergeRequestOptions): Promise<UploadResult>;
    /**
     * 检查分片是否存在
     *
     * @param options 分片存在检查选项
     * @returns 上传结果
     */
    checkChunkExists(options: CheckChunkExistsOptions): Promise<UploadResult>;
    /**
     * 检查文件是否存在
     *
     * @param filename 文件名
     * @param fileHash 文件哈希值
     * @param context 上传上下文
     * @returns 上传结果
     */
    checkFileExists(filename: string, fileHash: string, context: UploadContext): Promise<UploadResult>;
    /**
     * 执行实际的合并操作
     *
     * @param options 合并请求选项
     * @returns 上传结果
     */
    private performMerge;
    /**
     * 获取文件扩展名
     *
     * @param filename 文件名
     * @returns 文件扩展名（包含点）
     */
    private getFileExtension;
    /**
     * 获取 MIME 类型
     *
     * @param filename 文件名
     * @returns MIME 类型
     */
    private getMimeType;
    /**
     * 将 UploadContext 转换为 NodeCreationContext
     */
    private convertUploadContextToNodeCreationContext;
}
//# sourceMappingURL=upload.orchestrator.d.ts.map