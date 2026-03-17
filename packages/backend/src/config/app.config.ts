///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
}

export interface SessionConfig {
  secret: string;
  maxAge: number; // Session 有效期（毫秒）
  name: string; // Session cookie 名称
}

export interface CacheConfig {
  l2DefaultTTL: number; // L2 缓存默认 TTL（秒）
  versionMaxAge: number; // 缓存版本最大有效期（毫秒）
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
  fileLock: FileLockConfig;
  mail: MailConfig;
  mxcad: MxCadConfig;
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
}