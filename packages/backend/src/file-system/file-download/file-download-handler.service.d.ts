import { Response } from 'express';
import { FileSystemService } from '../file-system.service';
/**
 * 文件下载处理服务
 *
 * 统一处理项目文件、公共资源库文件的下载响应
 * 支持 ETag 缓存、流式传输、错误处理和日志记录
 */
export declare class FileDownloadHandlerService {
    private readonly fileSystemService?;
    private readonly logger;
    constructor(fileSystemService?: FileSystemService | undefined);
    /**
     * 统一处理下载响应
     * @param nodeId 节点 ID
     * @param userId 用户 ID
     * @param res Express Response 对象
     * @param options 可选配置
     */
    handleDownload(nodeId: string, userId: string, res: Response, options?: {
        clientIp?: string;
    }): Promise<void>;
}
//# sourceMappingURL=file-download-handler.service.d.ts.map