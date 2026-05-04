import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
/**
 * 外部参照处理服务
 *
 * 负责处理项目文件和图纸库的外部参照文件访问请求
 * 提供统一的外部参照文件读取和流式传输逻辑
 */
export declare class ExternalReferenceHandler {
    private readonly configService;
    private readonly db;
    private readonly fileSystemService;
    private readonly fileSystemNodeService;
    private readonly logger;
    constructor(configService: ConfigService, db: DatabaseService, fileSystemService: FileSystemService, fileSystemNodeService: FileSystemNodeService);
    /**
     * 处理外部参照文件请求
     *
     * @param nodeId 节点 ID
     * @param fileName 外部参照文件名
     * @param res Express Response 对象
     * @param isLibrary 是否为图纸库（true=图纸库无需登录，false=项目文件需要登录验证）
     * @param userId 用户 ID（项目文件访问时必需）
     */
    handleExternalReferenceRequest(nodeId: string, fileName: string, res: Response, isLibrary?: boolean, userId?: string): Promise<void>;
    /**
     * 获取节点信息
     *
     * @param identifier 节点 ID 或 fileHash
     * @param isLibrary 是否为图纸库
     * @param userId 用户 ID（项目文件访问时必需）
     * @private
     */
    private getNodeInfo;
    /**
     * 流式传输文件
     *
     * @param filePath 文件绝对路径
     * @param fileName 文件名（用于 Content-Disposition）
     * @param res Express Response 对象
     * @private
     */
    private streamFile;
    /**
     * 获取文件 Content-Type
     *
     * @param ext 文件扩展名
     * @private
     */
    private getContentType;
}
//# sourceMappingURL=external-reference-handler.service.d.ts.map