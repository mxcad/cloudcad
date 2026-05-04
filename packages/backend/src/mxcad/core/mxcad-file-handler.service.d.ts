import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
/**
 * MxCAD 文件处理服务
 *
 * 统一处理项目文件、图纸库、图块库的文件访问请求
 * 支持 mxweb 文件和外部参照文件的访问
 */
export declare class MxcadFileHandlerService {
    private readonly configService;
    private readonly db;
    private readonly logger;
    constructor(configService: ConfigService, db: DatabaseService);
    /**
     * 统一处理文件访问请求
     * @param filename 文件路径（格式：YYYYMM/nodeId/fileHash.dwg.mxweb 或 YYYYMM/nodeId/fileHash/image.jpg）
     * @param res Express Response 对象
     */
    serveFile(filename: string, res: Response): Promise<void>;
    /**
     * 查找外部参照文件路径
     * @param filename 请求的文件路径
     * @returns 外部参照文件路径，如果不存在则返回 null
     */
    private findExternalReferencePath;
    /**
     * 流式传输文件
     * @param filePath 文件绝对路径
     * @param res Express Response 对象
     */
    private streamFile;
}
//# sourceMappingURL=mxcad-file-handler.service.d.ts.map