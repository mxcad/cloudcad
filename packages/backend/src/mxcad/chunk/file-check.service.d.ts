import { StorageCheckService } from '../../storage/storage-check.service';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';
/**
 * 文件检查服务
 * 负责检查文件是否存在、是否已存储等操作
 */
export declare class FileCheckService {
    private readonly storageCheckService;
    private readonly concurrencyManager;
    private readonly logger;
    constructor(storageCheckService: StorageCheckService, concurrencyManager: ConcurrencyManager);
    /**
     * 检查文件是否存在（带并发控制）
     * @param hash 文件哈希值
     * @param filename 文件名
     * @returns 文件是否存在
     */
    checkFileExists(hash: string, filename: string): Promise<boolean>;
    /**
     * 检查文件是否已存储
     * @param hash 文件哈希值
     * @param filename 文件名
     * @returns 文件是否已存储
     */
    checkFileInStorage(hash: string, filename: string): Promise<boolean>;
    /**
     * 执行文件存在性检查（内部方法）
     * @param hash 文件哈希值
     * @param filename 文件名
     * @returns 文件是否存在
     */
    private performFileExistenceCheck;
    /**
     * 获取转换后的文件扩展名
     * @param filename 原始文件名
     * @returns 转换后的扩展名
     */
    getConvertedExtension(filename: string): string;
}
//# sourceMappingURL=file-check.service.d.ts.map