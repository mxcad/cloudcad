import { FileSystemNode } from '@prisma/client';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
/**
 * 存储配额类型枚举
 */
export declare enum StorageQuotaType {
    PERSONAL = "PERSONAL",
    PROJECT = "PROJECT",
    LIBRARY = "LIBRARY"
}
/**
 * 存储配额信息接口
 */
export interface StorageQuotaInfo {
    type: StorageQuotaType;
    used: number;
    total: number;
    remaining: number;
    usagePercent: number;
}
/**
 * 存储配额服务
 * 负责统一管理三种类型的存储配额逻辑（个人空间、项目、公共资源库）
 */
export declare class StorageQuotaService {
    private readonly runtimeConfigService;
    private readonly logger;
    constructor(runtimeConfigService: RuntimeConfigService);
    /**
     * 判断节点的存储配额类型
     * @param node 文件系统节点
     * @returns 存储配额类型
     */
    determineQuotaType(node: Partial<FileSystemNode>): StorageQuotaType;
    /**
     * 获取存储配额上限
     * @param node 文件系统节点（可选）
     * @returns 配额上限（字节）
     */
    getStorageQuotaLimit(node?: Partial<FileSystemNode>): Promise<number>;
    /**
     * 更新节点的存储配额
     * @param nodeId 节点 ID
     * @param quotaGB 新配额值（GB）
     * @returns 更新后的节点
     */
    updateNodeStorageQuota(nodeId: string, quotaGB: number): Promise<FileSystemNode>;
}
//# sourceMappingURL=storage-quota.service.d.ts.map