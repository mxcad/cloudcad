import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/app.config';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';
import { CheckChunkDto, MergeChunksDto } from '../dto';
import { FileConversionService } from '../../mxcad/conversion/file-conversion.service';
import { FileSystemService } from '../../mxcad/infra/file-system.service';
/**
 * 合并分片响应
 */
interface MergeChunksResult {
    hash: string;
    fileName: string;
}
/**
 * 公开文件上传服务
 * 提供无需认证的分片上传功能
 * 复用 MxCadModule 的图纸转换和秒传逻辑
 */
export declare class PublicFileUploadService {
    private readonly configService;
    private readonly concurrencyManager;
    private readonly fileConversionService;
    private readonly fileSystemService;
    private readonly logger;
    private readonly tempPath;
    private readonly uploadPath;
    constructor(configService: ConfigService<AppConfig>, concurrencyManager: ConcurrencyManager, fileConversionService: FileConversionService, fileSystemService: FileSystemService);
    /**
     * 检查分片是否存在
     */
    checkChunkExists(dto: CheckChunkDto): Promise<boolean>;
    /**
     * 检查文件是否已存在（秒传检查）
     * 复用 MxCadModule 的逻辑，检查 uploads 目录是否已有转换好的 mxweb 文件
     */
    checkFileExist(filename: string, fileHash: string): Promise<{
        exist: boolean;
        mxwebPath?: string;
    }>;
    /**
     * 获取分片临时目录路径
     * 使用与登录上传相同的目录结构
     */
    getChunkTempDirPath(hash: string): string;
    /**
     * 获取上传文件保存路径（使用 hash 命名，与登录上传一致）
     */
    getUploadFilePath(hash: string, ext: string): string;
    /**
     * 根据文件名获取文件路径
     */
    getFilePath(filename: string): string;
    /**
     * 获取 uploads 目录路径
     */
    getUploadPath(): string;
    /**
     * 合并分片并进行图纸转换
     * 复用 MxCadModule 的图纸转换逻辑
     */
    mergeChunks(dto: MergeChunksDto): Promise<MergeChunksResult>;
    /**
     * 查找 uploads 目录中以指定前缀开头的文件
     */
    findFilesByPrefix(prefix: string): Promise<string[]>;
    /**
     * 执行实际的合并操作
     */
    private performMerge;
    /**
     * 清理临时目录
     */
    cleanupTempDirectory(hash: string): Promise<boolean>;
    /**
     * 读取文件内容
     */
    readFile(filePath: string): Promise<Buffer>;
    /**
     * 删除文件
     */
    deleteFile(filePath: string): Promise<void>;
}
export {};
//# sourceMappingURL=public-file-upload.service.d.ts.map