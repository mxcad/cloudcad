import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../infra/file-system.service';
import { FileMergeService } from '../upload/file-merge.service';
import { AppConfig } from '../../config/app.config';
/**
 * Tus 事件处理器
 *
 * 处理 @tus/server 的上传完成事件（finish）。
 * 在文件上传完成后调用 FileMergeService 进行文件转换和节点创建。
 *
 * 职责：
 * 1. 监听 tus onUploadFinish 事件
 * 2. 获取上传文件信息（文件路径、元数据等）
 * 3. 调用文件转换服务进行格式转换
 * 4. 创建文件系统节点
 * 5. 清理临时文件
 */
export declare class TusEventHandler {
    private readonly configService;
    private readonly fileSystemService;
    private readonly fileMergeService;
    private readonly logger;
    private readonly mxcadUploadPath;
    constructor(configService: ConfigService<AppConfig>, fileSystemService: FileSystemService, fileMergeService: FileMergeService);
    /**
     * 处理上传完成事件
     * @param uploadId tus 上传 ID
     * @param filePath 上传文件路径
     * @param metadata 上传元数据（文件名、哈希等）
     * @param userId 用户 ID（可选）
     */
    handleUploadFinish(uploadId: string, filePath: string, metadata: Record<string, string>, userId?: string, userRole?: string): Promise<void>;
}
//# sourceMappingURL=tus-event-handler.service.d.ts.map