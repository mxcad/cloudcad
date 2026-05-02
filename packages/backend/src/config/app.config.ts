///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
  connectTimeout: number; // 连接超时（毫秒）
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface UploadConfig {
  maxSize: number;
  allowedTypes: string[];
  maxFilesPerUpload: number; // 单次上传最大文件数
  allowedExtensions: string[]; // 允许的文件扩展名
  blockedExtensions: string[]; // 禁止的文件扩展名
  maxConcurrent: number; // 最大并发上传/转换任务数
  chunkMaxConcurrent: number; // 分片上传最大并发数
}

export interface SessionConfig {
  secret: string;
  maxAge: number; // Session 有效期（毫秒）
  name: string; // Session cookie 名称
  cookieDomain?: string; // Cookie 域名
  cookieSameSite: 'none' | 'lax' | 'strict'; // Cookie sameSite 策略
  cookieSecure: boolean; // 是否使用 secure Cookie
}

export interface CacheConfig {
  l2DefaultTTL: number; // L2 缓存默认 TTL（秒）
  versionMaxAge: number; // 缓存版本最大有效期（毫秒）
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
  timeout: number; // 锁超时时间（毫秒）
  retryInterval: number; // 重试间隔（毫秒）
  maxRetries: number; // 最大重试次数
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
  assemblyPath: string; // mxcadassembly.exe 路径
  fileExt: string; // 输出文件扩展名
  compression: boolean; // 是否压缩
  fontsPath?: string; // 字体目录
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
  fonts: FontsConfig; // 字体配置
  filesDataPath: string; // 本地存储路径
  svnRepoPath: string; // SVN 仓库存储路径
  mxcadUploadPath: string; // MxCAD 上传路径
  mxcadTempPath: string; // MxCAD 临时文件路径
  fileExtensions: FileExtensionsConfig; // 文件扩展名配置
  cacheTTL: CacheTTLConfig; // 缓存 TTL 配置
  fileLimits: FileLimitsConfig; // 文件限制配置
  pagination: PaginationConfig; // 分页配置
  timeout: TimeoutConfig; // 超时配置
  product: ProductConfig; // 产品信息配置
  cacheWarmup: CacheWarmupConfig; // 缓存预热配置
  storage: StorageConfig; // 存储配置
  svn: SvnConfig; // SVN 配置
  log: LogConfig; // 日志配置
  sms: SmsConfig; // 短信配置
  thumbnail: ThumbnailConfig; // 缩略图自动生成配置
  cooperate: CooperateConfig; // 协同服务配置
}
