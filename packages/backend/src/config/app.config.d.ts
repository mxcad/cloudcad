export interface DatabaseConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
    maxConnections: number;
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
}
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    connectTimeout: number;
}
export interface JwtConfig {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
}
export interface UploadConfig {
    maxSize: number;
    allowedTypes: string[];
    maxFilesPerUpload: number;
    allowedExtensions: string[];
    blockedExtensions: string[];
    maxConcurrent: number;
    chunkMaxConcurrent: number;
}
export interface SessionConfig {
    secret: string;
    maxAge: number;
    name: string;
    cookieDomain?: string;
    cookieSameSite: 'none' | 'lax' | 'strict';
    cookieSecure: boolean;
}
export interface CacheConfig {
    l2DefaultTTL: number;
    versionMaxAge: number;
}
/**
 * 用户注销数据清理配置
 */
export interface UserCleanupConfig {
    /** 注销后延迟清理天数 */
    delayDays: number;
    /** 是否启用自动清理 */
    enabled: boolean;
    /** Cron 表达式（默认每天凌晨 4 点执行） */
    cronExpression: string;
}
export interface FileLockConfig {
    timeout: number;
    retryInterval: number;
    maxRetries: number;
}
export interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
}
export interface MxCadConfig {
    assemblyPath: string;
    fileExt: string;
    compression: boolean;
    fontsPath?: string;
}
/**
 * 字体配置
 */
export interface FontsConfig {
    /** 后端字体目录（转换程序使用） */
    backendPath: string;
    /** 前端字体目录（Web 显示使用） */
    frontendPath: string;
}
/**
 * 文件扩展名配置
 */
export interface FileExtensionsConfig {
    /** CAD 文件扩展名 */
    cad: string[];
    /** 图片文件扩展名 */
    image: string[];
    /** 文档文件扩展名 */
    document: string[];
    /** 压缩文件扩展名 */
    archive: string[];
    /** 字体文件扩展名 */
    font: string[];
    /** 禁止上传的扩展名 */
    forbidden: string[];
}
/**
 * 缓存 TTL 配置（单位：秒）
 */
export interface CacheTTLConfig {
    /** 验证码有效期（秒） */
    verificationCode: number;
    /** 验证码限流周期（秒） */
    verificationRateLimit: number;
    /** Token 黑名单有效期（秒） */
    tokenBlacklist: number;
    /** 缓存版本有效期（秒） */
    cacheVersion: number;
    /** 默认缓存 TTL（秒） */
    default: number;
    /** MxCAD 缓存 TTL（秒） */
    mxcad: number;
    /** 权限缓存 TTL（秒） */
    permission: number;
    /** 策略缓存 TTL（秒） */
    policy: number;
}
/**
 * 文件限制配置
 */
export interface FileLimitsConfig {
    /** ZIP 解压最大总大小（字节） */
    zipMaxTotalSize: number;
    /** ZIP 解压最大文件数 */
    zipMaxFileCount: number;
    /** ZIP 解压最大深度 */
    zipMaxDepth: number;
    /** ZIP 解压单文件最大大小（字节） */
    zipMaxSingleFileSize: number;
    /** ZIP 压缩级别 */
    zipCompressionLevel: number;
    /** 最大文件名长度 */
    maxFilenameLength: number;
    /** 最大路径长度 */
    maxPathLength: number;
    /** 最大目录深度 */
    maxDirectoryDepth: number;
    /** 最大递归深度 */
    maxRecursionDepth: number;
    /** 角色继承最大深度 */
    maxHierarchyDepth: number;
}
/**
 * 分页配置
 */
export interface PaginationConfig {
    /** 默认页大小 */
    defaultPageSize: number;
    /** 最大页大小 */
    maxPageSize: number;
}
/**
 * 超时配置（单位：毫秒）
 */
export interface TimeoutConfig {
    /** 文件转换超时 */
    fileConversion: number;
    /** 分布式锁超时 */
    distributedLock: number;
    /** 请求限流超时 */
    rateLimiter: number;
    /** 目录分配节点限制超时 */
    directoryAllocator: number;
}
/**
 * 产品信息配置
 */
export interface ProductConfig {
    /** 产品名称 */
    name: string;
    /** 默认发件人 */
    defaultSender: string;
}
/**
 * 缓存预热配置
 */
export interface CacheWarmupConfig {
    /** 最大预热用户数 */
    maxUsers: number;
    /** 最大预热项目数 */
    maxProjects: number;
}
/**
 * 存储配置
 */
export interface StorageConfig {
    /** 单目录最大节点数 */
    nodeLimit: number;
}
/**
 * SVN 配置
 */
export interface SvnConfig {
    /** 忽略的文件模式列表（逗号分隔） */
    ignorePatterns: string[];
}
/**
 * 日志配置
 */
export interface LogConfig {
    /** 日志级别列表 */
    levels: ('error' | 'warn' | 'log' | 'debug' | 'verbose')[];
}
/**
 * 短信服务商类型
 */
export type SmsProviderType = 'aliyun' | 'tencent' | 'mock';
/**
 * 阿里云短信配置
 */
export interface AliyunSmsConfig {
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
    regionId?: string;
}
/**
 * 腾讯云短信配置
 */
export interface TencentSmsConfig {
    secretId: string;
    secretKey: string;
    appId: string;
    signName: string;
    templateId: string;
    region?: string;
}
/**
 * 短信配置
 * 注意：短信服务开关（smsEnabled）已迁移到运行时配置系统
 */
export interface SmsConfig {
    /** 服务商类型 */
    provider: SmsProviderType;
    /** 阿里云配置 */
    aliyun: AliyunSmsConfig;
    /** 腾讯云配置 */
    tencent: TencentSmsConfig;
    /** 发送限制配置 */
    limits: SmsLimitsConfig;
}
/**
 * 短信发送限制配置
 */
export interface SmsLimitsConfig {
    /** 每个手机号每日发送上限 */
    dailyLimitPerPhone: number;
    /** 每个 IP 每小时发送上限 */
    hourlyLimitPerIp: number;
}
/**
 * 缩略图自动生成配置
 */
export interface ThumbnailConfig {
    /** MxWebDwg2Jpg.exe 路径（用于将 mxweb 转换为 jpg 缩略图） */
    dwg2JpgPath: string;
    /** 是否启用后端自动生成缩略图 */
    autoGenerateEnabled: boolean;
    /** 缩略图宽度（像素） */
    width: number;
    /** 缩略图高度（像素） */
    height: number;
    /** 缩略图背景颜色，十六进制 RGB 格式，默认黑色 */
    backgroundColor: string;
}
export interface CooperateConfig {
    /** 协同服务地址 */
    url: string;
}
export interface AppConfig {
    port: number;
    nodeEnv: string;
    frontendUrl: string;
    jwt: JwtConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    upload: UploadConfig;
    session: SessionConfig;
    cache: CacheConfig;
    userCleanup: UserCleanupConfig;
    fileLock: FileLockConfig;
    mail: MailConfig;
    mxcad: MxCadConfig;
    fonts: FontsConfig;
    filesDataPath: string;
    svnRepoPath: string;
    mxcadUploadPath: string;
    mxcadTempPath: string;
    fileExtensions: FileExtensionsConfig;
    cacheTTL: CacheTTLConfig;
    fileLimits: FileLimitsConfig;
    pagination: PaginationConfig;
    timeout: TimeoutConfig;
    product: ProductConfig;
    cacheWarmup: CacheWarmupConfig;
    storage: StorageConfig;
    svn: SvnConfig;
    log: LogConfig;
    sms: SmsConfig;
    thumbnail: ThumbnailConfig;
    cooperate: CooperateConfig;
}
//# sourceMappingURL=app.config.d.ts.map