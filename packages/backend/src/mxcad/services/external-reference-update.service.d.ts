import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import { ExternalReferenceStats } from '../types/external-reference.types';
import { AppConfig } from '../../config/app.config';
/**
 * 外部参照更新服务
 * 负责处理文件上传后的外部参照信息更新逻辑
 *
 * 此服务从 MxCadService 中提取，用于消除循环依赖：
 * MxCadService → FileUploadManagerFacadeService → FileConversionUploadService → MxCadService
 */
export declare class ExternalReferenceUpdateService {
    private readonly configService;
    private readonly fileSystemNodeService;
    private readonly storageManager;
    private readonly logger;
    private readonly mxcadUploadPath;
    constructor(configService: ConfigService<AppConfig>, fileSystemNodeService: FileSystemNodeService, storageManager: StorageManager);
    /**
     * 上传完成后更新外部参照信息
     * @param nodeId 文件系统节点 ID
     */
    updateAfterUpload(nodeId: string): Promise<void>;
    /**
     * 获取外部参照统计信息
     * @param nodeId 文件系统节点 ID
     * @returns 外部参照统计信息
     */
    getStats(nodeId: string): Promise<ExternalReferenceStats>;
    /**
     * 更新文件节点的外部参照信息
     * @param nodeId 文件系统节点 ID
     * @param stats 外部参照统计信息
     */
    updateInfo(nodeId: string, stats: ExternalReferenceStats): Promise<void>;
    /**
     * 获取外部参照预加载数据
     * @param nodeId 文件系统节点 ID
     * @returns 预加载数据，如果文件不存在则返回 null
     */
    getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null>;
    /**
     * 检查外部参照文件是否存在
     * @param nodeId 源图纸文件的节点 ID
     * @param fileName 外部参照文件名
     * @returns 文件是否存在
     */
    checkExists(nodeId: string, fileName: string): Promise<boolean>;
    /**
     * 获取外部参照目录名称
     * 从源图纸的 preloading.json 文件中读取 src_file_md5 字段作为目录名
     * @param nodeId 源图纸节点 ID
     * @returns 外部参照目录名称（src_file_md5 值）
     */
    getExtRefDirName(nodeId: string): Promise<string>;
    /**
     * 获取节点的存储根路径
     * @param nodeId 节点 ID
     * @returns 存储根路径，如果找不到节点则返回 uploads 路径（兼容旧文件）
     */
    private getStorageRootPath;
    /**
     * 验证哈希值格式（32位十六进制）
     */
    private isValidFileHash;
}
//# sourceMappingURL=external-reference-update.service.d.ts.map