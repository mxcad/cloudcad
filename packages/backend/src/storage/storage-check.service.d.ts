import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
/**
 * 存储检查服务
 * 用于检查文件是否存在于不同存储位置
 */
export declare class StorageCheckService {
    private readonly configService;
    private readonly storageService;
    private readonly logger;
    constructor(configService: ConfigService, storageService: StorageService);
    /**
     * 检查文件是否存在于本地存储
     * @param key 存储键名
     * @returns 是否存在
     */
    checkInStorage(key: string): Promise<boolean>;
    /**
     * 检查文件是否存在于本地文件系统
     * @param filePath 文件路径
     * @returns 是否存在
     */
    checkInLocal(filePath: string): Promise<boolean>;
    /**
     * 检查文件是否存在于任何位置（存储或本地）
     * @param key 存储键名或文件路径
     * @returns 是否存在
     */
    checkInAny(key: string): Promise<boolean>;
    /**
     * 检查文件是否存在于指定本地目录
     * @param fileName 文件名
     * @param directory 目录路径
     * @returns 是否存在
     */
    checkInLocalDirectory(fileName: string, directory: string): Promise<boolean>;
    /**
     * 检查文件是否存在于上传临时目录
     * @param fileName 文件名
     * @returns 是否存在
     */
    checkInUploadTemp(fileName: string): Promise<boolean>;
    /**
     * 检查文件是否存在于转换目录
     * @param fileName 文件名
     * @returns 是否存在
     */
    checkInConvertDirectory(fileName: string): Promise<boolean>;
}
//# sourceMappingURL=storage-check.service.d.ts.map