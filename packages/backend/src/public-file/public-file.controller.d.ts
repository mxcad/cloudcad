import { PublicFileService } from './public-file.service';
import { CheckChunkDto, UploadChunkDto, MergeChunksDto, CheckFileDto, CheckChunkResponseDto, UploadChunkResponseDto, MergeCompleteResponseDto, CheckFileResponseDto, UploadExtReferenceDto } from './dto';
import { Response } from 'express';
export declare class PublicFileController {
    private readonly publicFileService;
    private readonly logger;
    constructor(publicFileService: PublicFileService);
    /**
     * 检查分片是否存在
     * POST /api/public-file/chunk/check
     */
    checkChunk(dto: CheckChunkDto): Promise<CheckChunkResponseDto>;
    /**
     * 检查文件是否已存在（秒传检查）
     * POST /api/public-file/file/check
     */
    checkFile(dto: CheckFileDto): Promise<CheckFileResponseDto>;
    /**
     * 上传分片
     * POST /api/public-file/chunk/upload
     * 注意：使用内存存储，然后手动保存到正确的分片目录
     * 因为 Multer 的 destination 回调在 req.body 解析之前执行
     */
    uploadChunk(dto: UploadChunkDto, file: Express.Multer.File): Promise<UploadChunkResponseDto>;
    /**
     * 合并分片并获取文件访问信息
     * POST /api/public-file/chunk/merge
     */
    mergeChunks(dto: MergeChunksDto): Promise<MergeCompleteResponseDto>;
    /**
     * 通过文件哈希访问目录下的文件
     * GET /api/public-file/access/:hash/:filename
     * 返回 uploads/{hash}/{filename}
     */
    accessFile(hash: string, filename: string, res: Response): Promise<void>;
    /**
     * 上传外部参照文件（公开接口，无需认证）
     * POST /api/public-file/ext-reference/upload
     * 外部参照文件存储在主图纸的 hash 目录下
     */
    uploadExtReference(dto: UploadExtReferenceDto, file: Express.Multer.File): Promise<{
        ret: string;
        hash?: string;
        message?: string;
    }>;
    /**
     * 检查外部参照文件是否存在
     * GET /api/public-file/ext-reference/check?srcHash=xxx&fileName=xxx
     */
    checkExtReference(srcHash: string, fileName: string): Promise<{
        exists: boolean;
    }>;
    /**
     * 获取预加载数据（包含外部参照信息）
     * GET /api/public-file/preloading/:hash
     */
    getPreloadingData(hash: string): Promise<any>;
}
//# sourceMappingURL=public-file.controller.d.ts.map