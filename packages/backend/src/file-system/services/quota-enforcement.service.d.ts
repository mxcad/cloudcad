import { StorageInfoService, StorageQuotaInfo } from './storage-info.service';
/**
 * 配额超额异常数据结构
 */
export interface QuotaExceededError {
    code: 'QUOTA_EXCEEDED';
    message: string;
    quotaInfo: {
        used: number;
        total: number;
        remaining: number;
        usagePercent: number;
    };
}
/**
 * 配额检查结果
 */
export interface QuotaCheckResult {
    allowed: boolean;
    quotaInfo: StorageQuotaInfo;
}
/**
 * 配额强制执行服务
 * 负责在上传前检查配额是否充足
 */
export declare class QuotaEnforcementService {
    private readonly storageInfoService;
    private readonly logger;
    constructor(storageInfoService: StorageInfoService);
    /**
     * 检查上传是否超出配额
     * @param userId 用户 ID
     * @param nodeId 目标节点 ID（用于判断配额类型）
     * @param fileSize 文件大小（字节）
     * @throws BadRequestException 如果超出配额
     */
    checkUploadQuota(userId: string, nodeId: string, fileSize: number): Promise<QuotaCheckResult>;
    /**
     * 检查用户是否已超额使用配额
     * @param userId 用户 ID
     * @param nodeId 目标节点 ID
     */
    isQuotaExceeded(userId: string, nodeId: string): Promise<boolean>;
    /**
     * 获取配额超额详情
     * @param userId 用户 ID
     * @param nodeId 目标节点 ID
     */
    getQuotaExceededDetails(userId: string, nodeId: string): Promise<{
        isExceeded: boolean;
        exceededBy: number;
        quotaInfo: StorageQuotaInfo;
        suggestions: string[];
    }>;
    /**
     * 格式化文件大小显示
     */
    private formatSize;
}
//# sourceMappingURL=quota-enforcement.service.d.ts.map