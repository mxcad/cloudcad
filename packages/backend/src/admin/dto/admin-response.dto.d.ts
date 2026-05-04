/**
 * 管理员统计响应 DTO
 */
export declare class AdminStatsResponseDto {
    message: string;
    timestamp: string;
}
/**
 * 缓存统计 DTO（管理后台视图）
 */
export declare class AdminCacheStatsDto {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
}
/**
 * 缓存统计响应 DTO
 */
export declare class CacheStatsResponseDto {
    message: string;
    data: AdminCacheStatsDto;
}
/**
 * 缓存清理响应 DTO
 */
export declare class CacheCleanupResponseDto {
    message: string;
}
/**
 * 用户权限信息 DTO
 */
export declare class UserPermissionInfoDto {
    userRole: string;
    permissions: string[];
}
/**
 * 用户权限响应 DTO
 */
export declare class UserPermissionsResponseDto {
    message: string;
    data: UserPermissionInfoDto;
}
/**
 * 用户缓存清理响应 DTO
 */
export declare class UserCacheClearResponseDto {
    message: string;
}
//# sourceMappingURL=admin-response.dto.d.ts.map