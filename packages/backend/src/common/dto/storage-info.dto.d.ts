export declare enum StorageQuotaType {
    PERSONAL = "PERSONAL",
    PROJECT = "PROJECT",
    LIBRARY = "LIBRARY"
}
/**
 * 存储空间信息 DTO
 */
export declare class StorageInfoDto {
    type: StorageQuotaType;
    used: number;
    total: number;
    remaining: number;
    usagePercent: number;
}
//# sourceMappingURL=storage-info.dto.d.ts.map