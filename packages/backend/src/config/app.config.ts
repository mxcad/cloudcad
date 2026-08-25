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
  refreshSecret: string;
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
  /**
   * cookie 的 Secure 标志。
   * - boolean：显式设置（SESSION_COOKIE_SECURE=true/false），强制覆盖
   * - null：未设置，按请求协议自适应（http 不带 Secure，https 带 Secure）
   */
  cookieSecure: boolean | null;
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

export interface MxConfig {
  ignorePatterns: string[];
}

export interface LogConfig {
  /** 日志根目录（默认 data/logs，ADR-0055 §1） */
  dir: string;
  /** 应用/访问日志保留天数（默认 180，ADR-0055 §1） */
  retentionDays: number;
  /** 访问日志开关（默认开启，ADR-0055 §1；LOG_ACCESS_ENABLED 可配） */
  accessEnabled: boolean;
  /** 慢查询阈值（毫秒），超过此阈值的 SQL 会打印日志（仅开发环境生效） */
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

export interface BatchDownloadConfig {
  exportDir: string;
  minDiskSpace: number;
  zipRetentionHours: number;
  dbRetentionDays: number;
  maxConcurrency: number;
  /** 批量转换是否委托 conversion-service 服务 */
  delegateWorkflow: boolean;
  /** conversion-service 服务地址 */
  conversionServiceUrl: string;
  /** workflow 任务轮询间隔（毫秒） */
  workflowPollIntervalMs: number;
  /** workflow 任务轮询超时（毫秒） */
  workflowTimeoutMs: number;
}

export interface AuthRateLimitConfig {
  /** 登录尝试次数上限（/窗口/账号） */
  loginMax: number;
  /** 登录尝试窗口（秒） */
  loginWindowSeconds: number;
  /** 密码找回次数上限（/窗口/账号） */
  passwordResetMax: number;
  /** 密码找回窗口（秒） */
  passwordResetWindowSeconds: number;
  /** 注册次数上限（/窗口/账号） */
  registerMax: number;
  /** 注册窗口（秒） */
  registerWindowSeconds: number;
}

export interface AuditConfig {
  /** 审计日志保留天数（默认 180，#207/ADR-0045；兼容旧变量 AUDIT_RETENTION_DAYS 回退） */
  retentionDays: number;
}

export interface TaskRunConfig {
  /** 后台任务执行记录保留天数（默认 30，#271 无界增长治理） */
  retentionDays: number;
}

export interface MxcadConfig {
  /** mxcadassembly 可执行文件路径 */
  assemblyPath: string;
  /** 输出文件扩展名 */
  fileExt: string;
  /** 是否启用压缩 */
  compression: boolean;
}

/** 监控指标端点抓取令牌配置（#315） */
export interface MetricsScrapeConfig {
  /**
   * Prometheus 抓取令牌（环境变量 SCRAPE_TOKEN，默认空 = 未启用）
   * 配置后 /api/metrics 接受 Authorization: Bearer <SCRAPE_TOKEN>
   * 或 Basic 认证（密码字段与令牌比对）；未配置时退回 SYSTEM_MONITOR 权限控制
   */
  scrapeToken: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  /** 自定义认证实现模块路径（环境变量 IMPL），为空则使用默认实现 */
  authImpl: string;
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
  mxcad: MxcadConfig;
  filesDataPath: string;
  avatarPath: string;
  mxRepoPath: string;
  mxcadUploadPath: string;
  mxcadTempPath: string;
  mxcadDebugPath: string;
  fileExtensions: FileExtensionsConfig;
  cacheTTL: CacheTTLConfig;
  fileLimits: FileLimitsConfig;
  pagination: PaginationConfig;
  timeout: TimeoutConfig;
  product: ProductConfig;
  cacheWarmup: CacheWarmupConfig;
  storage: StorageConfig;
  mx: MxConfig;
  log: LogConfig;
  sms: SmsConfig;
  payment: PaymentConfig;
  wechatPay: WechatPayConfig;
  thumbnail: ThumbnailConfig;
  cooperate: CooperateConfig;
  batchDownload: BatchDownloadConfig;
  authRateLimit: AuthRateLimitConfig;
  audit: AuditConfig;
  taskRun: TaskRunConfig;
  /** /metrics 抓取令牌认证（#315） */
  metrics: MetricsScrapeConfig;
  /** 管理员登录 IP 白名单（本地文件兜底通道） */
  adminIpWhitelist: AdminIpWhitelistConfig;
}

/** 管理员登录 IP 白名单配置 */
export interface AdminIpWhitelistConfig {
  /**
   * 本地白名单文件绝对路径（环境变量 ADMIN_IP_WHITELIST_FILE，相对路径基于项目根）
   * 文件格式：JSON（{"ips": ["1.2.3.4", "10.0.0.0/8"]} 或纯数组）或每行一个 IP/CIDR 的纯文本（# 注释）
   * 兜底语义：管理员在界面误删自己的白名单后，可在服务器上直接编辑此文件恢复访问
   */
  file: string;
  /**
   * 可信反向代理地址段（环境变量 ADMIN_TRUSTED_PROXY_IPS，逗号分隔，支持精确 IP/CIDR）
   *
   * 安全说明：白名单判定必须基于**不可伪造**的真实 IP。TCP 层对端地址
   * （req.socket.remoteAddress）不可被客户端伪造，但部署在反向代理（Nginx 等）之后时
   * 它是代理 IP；此时需在此配置代理地址段，白名单判定才会信任由代理转发的
   * X-Forwarded-For **最右侧**地址（该地址由可信代理追加，客户端伪造的最左侧项不影响）。
   *
   * 直连部署（无反向代理）时无需配置：默认取 TCP 对端真实地址，
   * 客户端伪造 X-Forwarded-For 头不会影响判定。
   *
   * 默认值：127.0.0.1,::1（本机反代）。
   */
  trustedProxies: string[];
}
