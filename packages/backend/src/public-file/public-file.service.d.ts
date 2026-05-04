import { CheckChunkDto, MergeChunksDto, CheckFileDto, CheckChunkResponseDto, MergeCompleteResponseDto, CheckFileResponseDto } from './dto';
import { PublicFileUploadService } from './services/public-file-upload.service';
import { FileConversionService } from '../mxcad/conversion/file-conversion.service';
/**
 * 公开文件服务
 * 提供无需认证的文件上传和访问功能
 */
export declare class PublicFileService {
    private readonly uploadService;
    private readonly fileConversionService?;
    private readonly logger;
    constructor(uploadService: PublicFileUploadService, fileConversionService?: FileConversionService | undefined);
    /**
     * 检查分片是否存在
     */
    checkChunk(dto: CheckChunkDto): Promise<CheckChunkResponseDto>;
    /**
     * 保存分片文件到临时目录
     * 手动处理文件保存，避免 Multer 解析顺序问题
     */
    saveChunk(fileBuffer: Buffer, hash: string, chunkIndex: number): Promise<void>;
    /**
     * 检查文件是否已存在（秒传检查）
     * 如果文件已存在，返回文件哈希
     */
    checkFile(dto: CheckFileDto): Promise<CheckFileResponseDto>;
    /**
     * 合并分片并返回文件访问信息
     */
    mergeChunks(dto: MergeChunksDto): Promise<MergeCompleteResponseDto>;
    /**
     * 根据 hash 在 uploads 目录中查找 mxweb 文件
     * 查找模式: {hash}.{原扩展名}.mxweb （如 4b298dd48355af1202b532fc4d051658.dwg.mxweb）
     */
    findMxwebFile(hash: string): Promise<string | null>;
    /**
     * 在 uploads/{hash} 目录下查找指定文件
     * 如 findFileInDir(hash, "A1.dwg.mxweb") 返回 uploads/{hash}/A1.dwg.mxweb
     */
    findFileInDir(hash: string, filename: string): Promise<string | null>;
    /**
     * 读取文件内容
     */
    readFile(filePath: string): Promise<Buffer>;
    /**
     * 删除文件
     */
    deleteFile(filePath: string): Promise<void>;
    /**
     * 上传外部参照文件（公开接口，无需认证）
     * 外部参照文件存储在主图纸的 hash 目录下
     * @param fileBuffer 文件内容
     * @param srcFileHash 主图纸文件的 hash
     * @param extRefFileName 外部参照文件名（含扩展名）
     * @param fileHash 文件哈希值（可选）
     * @returns 上传结果
     */
    uploadExtReference(fileBuffer: Buffer, srcFileHash: string, extRefFileName: string, fileHash?: string): Promise<{
        ret: string;
        hash?: string;
        message?: string;
    }>;
    /**
     * 检查外部参照文件是否存在
     * @param srcFileHash 主图纸文件的 hash
     * @param extRefFileName 外部参照文件名
     * @returns 是否存在
     */
    checkExtReferenceExists(srcFileHash: string, extRefFileName: string): Promise<boolean>;
    /**
     * 获取预加载数据（包含外部参照信息）
     * @param hash 文件 hash
     * @returns 预加载数据
     */
    getPreloadingData(hash: string): Promise<any>;
}
//# sourceMappingURL=public-file.service.d.ts.map