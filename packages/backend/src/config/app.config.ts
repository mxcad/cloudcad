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

export interface UserCleanupConfig {
  delayDays: number;
  enabled: boolean;
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

export interface FontsConfig {
  backendPath: string;
  frontendPath: string;
}

export interface FileExtensionsConfig {
  cad: string[];
  image: string[];
  document: string[];
  archive: string[];
  font: string[];
  forbidden: string[];
}

export interface CacheTTLConfig {
  verificationCode: number;
  verificationRateLimit: number;
  tokenBlacklist: number;
  cacheVersion: number;
  default: number;
  mxcad: number;
  permission: number;
  policy: number;
}

export interface FileLimitsConfig {
  zipMaxTotalSize: number;
  zipMaxFileCount: number;
  zipMaxDepth: number;
  zipMaxSingleFileSize: number;
  zipCompressionLevel: number;
  maxFilenameLength: number;
  maxPathLength: number;
  maxDirectoryDepth: number;
  maxRecursionDepth: number;
  maxHierarchyDepth: number;
}

export interface PaginationConfig {
  defaultPageSize: number;
  maxPageSize: number;
}

export interface TimeoutConfig {
  fileConversion: number;
  distributedLock: number;
  rateLimiter: number;
  directoryAllocator: number;
}

export interface ProductConfig {
  name: string;
  defaultSender: string;
}

export interface CacheWarmupConfig {
  maxUsers: number;
  maxProjects: number;
}

export interface StorageConfig {
  nodeLimit: number;
}

export interface StorageCleanupConfig {
  delayDays: number;
  enabled: boolean;
  cronExpression: string;
}

export interface TrashCleanupConfig {
  delayDays: number;
  enabled: boolean;
  cronExpression: string;
}

export interface OrphanCleanupConfig {
  delayDays: number;
  enabled: boolean;
  cronExpression: string;
}

export interface MxConfig {
  ignorePatterns: string[];
}

export interface LogConfig {
  levels: ('error' | 'warn' | 'log' | 'debug' | 'verbose')[];
  slowQueryThresholdMs: number;
}

export type SmsProviderType = 'aliyun' | 'tencent' | 'mock';

export interface AliyunSmsConfig {
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  regionId?: string;
}

export interface TencentSmsConfig {
  secretId: string;
  secretKey: string;
  appId: string;
  signName: string;
  templateCode: string;
  region?: string;
}

export interface SmsConfig {
  provider: SmsProviderType;
  aliyun: AliyunSmsConfig;
  tencent: TencentSmsConfig;
  limits: SmsLimitsConfig;
}

export interface SmsLimitsConfig {
  dailyLimitPerPhone: number;
  hourlyLimitPerIp: number;
}

export interface ThumbnailConfig {
  dwg2JpgPath: string;
  autoGenerateEnabled: boolean;
  width: number;
  height: number;
  backgroundColor: string;
}

export interface PaymentConfig {
  provider: string;
}

export interface WechatPayConfig {
  appId: string;
  mchId: string;
  key: string;
  signType: 'MD5' | 'HMAC-SHA256';
  notifyUrl: string;
  certPath?: string;
  keyPath?: string;
}

export interface CooperateConfig {
  url: string;
}

export interface ConversionConfig {
  binPath: string;
  outputRoot: string;
  maxConcurrency: number;
  defaultTimeoutMs: number;
  fileExt: string;
  compression: boolean;
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
  fonts: FontsConfig;
  conversion: ConversionConfig;
  filesDataPath: string;
  mxRepoPath: string;
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
  storageCleanup: StorageCleanupConfig;
  trashCleanup: TrashCleanupConfig;
  orphanCleanup: OrphanCleanupConfig;
  mx: MxConfig;
  log: LogConfig;
  sms: SmsConfig;
  payment: PaymentConfig;
  wechatPay: WechatPayConfig;
  thumbnail: ThumbnailConfig;
  cooperate: CooperateConfig;
}
