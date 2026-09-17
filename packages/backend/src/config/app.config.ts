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

/** TOTP 双因素配置（#415）：secret 密文存储的加密密钥来源 */
export interface TotpConfig {
  /** AES-256-GCM 加密密钥（TOTP_ENCRYPTION_KEY），缺省回退 JWT_SECRET */
  encryptionKey: string;
}

/** PII 字段级加密配置（#417 等保 8.1.4.8）：phone/email 密文存储与归一化索引密钥 */
export interface PiiConfig {
  /** AES-256-GCM 加密密钥（32 字节 hex，64 字符；env PII_ENCRYPTION_KEY 显式设置时启动校验长度，缺省回退 SHA-256(JWT_SECRET)） */
  encryptionKey: string;
  /** HMAC-SHA256 索引密钥（32 字节 hex，64 字符；env PII_HMAC_KEY 显式设置时启动校验长度，缺省回退 SHA-256(JWT_REFRESH_SECRET)） */
  hmacKey: string;
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
  /** 多格式下载转换产物缓存目录（空 = 未配置） */
  conversionCacheDir: string;
  /** 转换产物缓存 TTL（小时），0 = 不启用缓存 */
  conversionCacheTtlHours: number;
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

/**
 * 口令策略配置（#416 等保 8.1.4.1 a)/b)）
 *
 * 复杂度：新设口令 ≥minLength 位 + 大小写/数字/特殊字符四类至少三类 + 弱口令黑名单。
 * 定期更换（仅 ADMIN 角色生效）：maxAgeDays 天到期强制改密，提前 expiringSoonDays 天提示。
 */
export interface PasswordPolicyConfig {
  /** 口令最小长度（默认 10） */
  minLength: number;
  /** 口令最大有效期（天，默认 180；到期强制改密，仅 ADMIN 角色生效） */
  maxAgeDays: number;
  /** 提前提示天数（默认 14；到期前 N 天提示，仅 ADMIN 角色生效） */
  expiringSoonDays: number;
  /**
   * 定期更换 / 首登未改密「强制改密」总开关（默认 false=关闭，仅 ADMIN 角色生效）。
   * 关闭时 getPasswordChangeStatus 恒返回「无需强改」：登录不下发 passwordChangeRequired、
   * JWT 不做改密锁定（上游 jwt.strategy / admin-auth 自动生效）。
   * 复杂度校验（assertPasswordPolicy）不受此开关影响，恒生效。
   */
  changeEnforceEnabled: boolean;
}

/**
 * 账号失败锁定配置（#416 等保 8.1.4.1 c) 防暴力破解）
 *
 * 与 AuthRateLimitConfig（5次/60s 频率限流）独立叠加：限流管「请求频率」，
 * 锁定管「连续失败暴力破解」——failThreshold 次失败（windowSeconds 窗口内）→ 锁 durationSeconds。
 * 锁期内正确密码也拒绝并告知剩余时间，无手动解锁页，到期自愈。Redis 故障降级进程内计数。
 */
export interface AccountLockConfig {
  /** 触发锁定的连续失败次数阈值（默认 10） */
  failThreshold: number;
  /** 失败计数窗口（秒，默认 900=15 分钟） */
  windowSeconds: number;
  /** 锁定时长（秒，默认 1800=30 分钟） */
  durationSeconds: number;
}

export interface AuditConfig {
  /** 审计日志保留天数（#322：默认 183，严格大于 6 个月；兼容旧变量 AUDIT_RETENTION_DAYS 回退） */
  retentionDays: number;
  /** 超期审计日志归档开关（#322，AUDIT_ARCHIVE_ENABLED；等保验收需开启） */
  archiveEnabled: boolean;
  /** 归档文件输出目录（#322，AUDIT_ARCHIVE_PATH，相对路径基于项目根解析） */
  archivePath: string;
}

export interface TaskRunConfig {
  /** 后台任务执行记录保留天数（#271 无界增长治理；#326 默认 180，运维排查窗口与等保对齐） */
  retentionDays: number;
}

/** 异地推送类型（#319：BACKUP_REMOTE_TYPE，none 时完全跳过推送） */
export type BackupRemoteType = 'none' | 'rsync' | 'oss' | 's3';

/** 数据库备份异地推送配置（#319，ADR-0055 §5） */
export interface BackupRemoteConfig {
  /** 推送类型（默认 none）；rsync=内网 SSH，oss/s3=对象存储 CLI 子进程（零新依赖） */
  type: BackupRemoteType;
  /** rsync 目标主机（若值本身含 user@ 前缀则优先于 user 字段） */
  host: string;
  /** rsync SSH 用户（key 认证，不走密码） */
  user: string;
  /** rsync 远端目标目录 */
  path: string;
  /** rsync 远端保留份数（超出清理最旧；仅 rsync 模式生效） */
  keep: number;
  /** oss/s3 endpoint（s3 兼容存储必填如 MinIO；AWS 原生可留空） */
  endpoint: string;
  /** oss/s3 桶名，可带路径前缀（如 mybucket/backups） */
  bucket: string;
  /** oss/s3 访问密钥 ID */
  accessKey: string;
  /** oss/s3 访问密钥 Secret */
  secret: string;
  /** rsync CLI 路径（未配置时从 PATH 探测） */
  rsyncPath: string;
  /** ossutil CLI 路径（未配置时从 PATH 探测） */
  ossutilPath: string;
  /** aws CLI 路径（未配置时从 PATH 探测） */
  awsCliPath: string;
}

/** 数据库备份配置（#318） */
export interface BackupConfig {
  /** 备份总开关（环境变量 BACKUP_ENABLED，默认 true；运行时开关 backupEnabled 可动态禁用） */
  enabled: boolean;
  /** 备份输出目录（默认 data/backups，相对路径基于项目根解析） */
  dir: string;
  /** 本地备份保留份数（超出清理最旧，默认 14） */
  keepLocal: number;
  /** 备份 cron 表达式（默认每日 01:00） */
  cron: string;
  /** pg_dump 可执行文件路径（未配置时按 runtime 目录 → PATH 探测） */
  pgDumpPath: string;
  /** 恢复演练开关（#320，BACKUP_DRILL_ENABLED，默认 true；每月临时库恢复 + 行数校验） */
  drillEnabled: boolean;
  /** 演练行数比对表清单（#320，BACKUP_DRILL_TABLES，逗号分隔，默认 audit_logs,alert_records,task_runs,users） */
  drillTables: string[];
  /** 异地推送（#319，ADR-0055 §5：none/rsync/oss/s3 三通道可配） */
  remote: BackupRemoteConfig;
}

/** 告警邮件通知配置（#311） */
export interface AlertEmailConfig {
  /** 总开关（默认关闭；ALERT_EMAIL_ENABLED=true 开启） */
  enabled: boolean;
  /** 收件人列表（ALERT_EMAIL_TO，逗号分隔） */
  to: string[];
  /** 连续发送失败多少次后升级为 P0 alert-email 告警（默认 5） */
  failEscalate: number;
  /** P1 按 source 聚合窗口分钟数（默认 15，#312；多实例部署存在跨实例重复发送风险，可接受） */
  p1WindowMinutes: number;
  /** P2 每日报表发送小时 0-23（默认 9，#312；无前日告警时不发送） */
  p2DailyHour: number;
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
  /**
   * 主机级磁盘指标采样路径（环境变量 HOST_METRIC_DISK_PATHS，逗号分隔，
   * 默认进程工作目录；ADR-0055 §4 / #316 host_disk_free_percent 指标）
   */
  hostDiskPaths: string[];
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  /** 自定义认证实现模块路径（环境变量 IMPL），为空则使用默认实现 */
  authImpl: string;
  jwt: JwtConfig;
  totp: TotpConfig;
  pii: PiiConfig;
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
  /** 口令策略（#416 等保 8.1.4.1 a)/b)） */
  passwordPolicy: PasswordPolicyConfig;
  /** 账号失败锁定（#416 等保 8.1.4.1 c) 防暴力破解） */
  accountLock: AccountLockConfig;
  audit: AuditConfig;
  taskRun: TaskRunConfig;
  /** 数据库备份（#318） */
  backup: BackupConfig;
  /** 告警邮件通知（#311：P0 实时邮件 + 恢复通知 + 失败升级） */
  alertEmail: AlertEmailConfig;
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
