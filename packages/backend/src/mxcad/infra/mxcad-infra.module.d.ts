/**
 * Mxcad 基础设施子模块
 *
 * 职责: 提供底层 I/O、缓存、缩略图生成和 Linux 环境初始化服务。
 * 本模块只依赖 ConfigModule，不依赖任何其他业务模块。
 *
 * 包含的服务:
 * - FileSystemService: 本地文件系统操作（目录/文件读写、分片合并）
 * - CacheManagerService: 内存缓存（TTL 支持）
 * - ThumbnailGenerationService: CAD 缩略图生成（MxWebDwg2Jpg.exe）
 * - LinuxInitService: Linux 环境初始化（OnModuleInit 自动执行）
 */
export declare class MxcadInfraModule {
}
//# sourceMappingURL=mxcad-infra.module.d.ts.map