/**
 * 存储配额子模块
 *
 * 职责: 统一管理个人空间、项目、公共资源库三种存储配额。
 *
 * 服务链:
 * - StorageQuotaService: 配额类型判定 + 上限计算（最底层，仅依赖 RuntimeConfigService）
 * - StorageInfoService: 已用空间计算 + 配额缓存（依赖 StorageQuotaService + DatabaseService）
 * - QuotaEnforcementService: 上传前配额检查（依赖 StorageInfoService）
 */
export declare class StorageQuotaModule {
}
//# sourceMappingURL=storage-quota.module.d.ts.map