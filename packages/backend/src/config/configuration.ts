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

import * as os from 'os';
import * as path from 'path';
import type { AppConfig } from './app.config';
import { resolvePiiKey } from '../common/pii/pii-crypto.service';

/**
 * 判断当前操作系统是否为 Windows
 */
const isWindows = os.platform() === 'win32';

/**
 * 解析 MxCAD 可执行文件路径，防止跨平台 .env 复制导致的误配置
 * 非 Windows 平台上以 .exe 结尾的路径一定是 Windows 可执行文件，
 * 此时忽略环境变量配置，回退到当前平台的默认路径
 * @param envPath 环境变量中配置的路径（可能为空）
 * @param windowsDefault Windows 平台默认路径
 * @param linuxDefault Linux 平台默认路径
 * @returns 与当前平台匹配的可执行文件路径
 */
function resolveMxExecutablePath(
  envPath: string | undefined,
  windowsDefault: string,
  linuxDefault: string
): string {
  if (envPath) {
    if (isWindows) {
      return envPath;
    }
    if (path.extname(envPath).toLowerCase() !== '.exe') {
      return envPath;
    }
  }
  return isWindows ? windowsDefault : linuxDefault;
}

/**
 * 项目根目录
 * 当前文件: packages/backend/dist/config/configuration.js
 * 向上 4 级: config/ → dist/ → backend/ → packages/ → <项目根目录>
 * 依赖: __dirname 始终指向当前模块所在目录，不随启动方式变化
 *
 * 注意：这是全后端唯一可靠的项目根锚点。其他模块（如 app.module / access-logger）
 * 若自行用 join(__dirname, '../../../../') 会因 __dirname 深度不同而解析到错误位置
 * （实例：app.module 位于 dist/ 根，4 级会跳到部署包外，导致日志写入外部 data/logs）。
 * 请统一 import 本常量，而非手写层级。
 */
export const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

/**
 * 解析路径为绝对路径
 * 如果是相对路径，基于项目根目录解析
 * @param inputPath 输入路径
 * @returns 绝对路径
 */
function resolvePath(inputPath: string): string {
  if (!inputPath) {
    return inputPath;
  }

  // 已经是绝对路径，直接返回
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  return path.resolve(PROJECT_ROOT, inputPath);
}

/**
 * 解析布尔值环境变量
 * @param value 环境变量值
 * @param defaultValue 默认值
 * @returns 布尔值
 */
function parseBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true';
}

/**
 * 解析 cookie Secure 标志（三态）：
 * - SESSION_COOKIE_SECURE 显式设置为 "true"/"false" → 返回对应布尔值（强制覆盖）
 * - 设置为 "auto" 或未设置 → 返回 null，表示按请求协议自适应（http 不带 Secure，https 带 Secure）
 *
 * 注：离线私有化部署常以 http 访问，此时若生产环境默认 Secure=true 会被浏览器丢弃，
 * 导致 session/auth_token cookie 无法存储（协同功能 401）。用 null（默认/auto）走协议自适应可根治。
 */
function parseCookieSecure(value: string | undefined): boolean | null {
  if (value === undefined || value === 'auto') return null;
  return value === 'true';
}

/**
 * 解析数组环境变量（逗号分隔）
 * @param value 环境变量值
 * @param defaultValue 默认值
 * @returns 数组
 */
function parseStringArray(
  value: string | undefined,
  defaultValue: string[]
): string[] {
  if (!value) return defaultValue;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getRequiredEnv(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`环境变量 ${key} 在生产环境中必须设置`);
    }
    return fallback;
  }
  return value;
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const filesDataPath = resolvePath(
    process.env.FILES_DATA_PATH || 'data/files'
  );

  if (isProduction) {
    // #419 等保 8.1.2.2：REDIS_PASSWORD 生产必填——内部链路 Redis 须 requirepass，
    // 防止同机/同网段未授权直连。dev 放行（本地 Redis 无密码）。
    const requiredVars = [
      'JWT_SECRET',
      'DB_PASSWORD',
      'SESSION_SECRET',
      'REDIS_PASSWORD',
    ];
    const missingVars = requiredVars.filter(
      (v) => !process.env[v] || process.env[v]!.trim() === ''
    );
    if (missingVars.length > 0) {
      throw new Error(`生产环境缺少必需的环境变量: ${missingVars.join(', ')}`);
    }
  }

  return {
    port: parseInt(process.env.PORT || '3001', 10) || 3001,
    nodeEnv,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    authImpl: process.env.IMPL || '',

    jwt: {
      secret: getRequiredEnv('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
      refreshSecret: getRequiredEnv(
        'JWT_REFRESH_SECRET',
        'dev-only-jwt-refresh-secret-change-me'
      ),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    // TOTP 双因素（#415）：secret 密文存储的加密密钥；缺省回退 JWT_SECRET
    totp: {
      encryptionKey:
        process.env.TOTP_ENCRYPTION_KEY ||
        getRequiredEnv('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
    },

    // PII 字段级加密（#417 等保 8.1.4.8）：phone/email 密文存储 + HMAC 归一化索引密钥；
    // env 显式设置时启动即校验（必须解码为 32 字节），缺省回退 JWT 密钥（开发环境可用）。
    // 以 hex 字符串形式存入配置（Buffer 非基础类型，ConfigService 路径类型推断不兼容）
    pii: {
      encryptionKey: resolvePiiKey(
        process.env.PII_ENCRYPTION_KEY,
        getRequiredEnv('JWT_SECRET', 'dev-only-jwt-secret-change-me')
      ).toString('hex'),
      hmacKey: resolvePiiKey(
        process.env.PII_HMAC_KEY,
        getRequiredEnv(
          'JWT_REFRESH_SECRET',
          'dev-only-jwt-refresh-secret-change-me'
        )
      ).toString('hex'),
    },

    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: getRequiredEnv('DB_PASSWORD', 'dev-only-db-password-change-me'),
      database: process.env.DB_DATABASE || 'cloudcad',
      ssl: parseBoolean(process.env.DB_SSL, false),
      maxConnections:
        parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10) || 20,
      connectionTimeoutMillis:
        parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10) || 30000,
      idleTimeoutMillis:
        parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10) || 30000,
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10) || 0,
      maxRetriesPerRequest:
        parseInt(process.env.REDIS_MAX_RETRIES || '3', 10) || 3,
      retryDelayOnFailover:
        parseInt(process.env.REDIS_RETRY_DELAY || '100', 10) || 100,
      connectTimeout:
        parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10) || 10000,
    },

    upload: {
      // 文件大小限制 - Multer 中间件层防护（第一层）
      // Multer 层已改为读取此值，而非硬编码
      // 业务层使用运行时配置 maxFileSize 进行精确限制
      // 运行时配置可在管理界面动态调整
      maxSize: 500 * 1024 * 1024, // 500MB 固定上限
      allowedTypes: parseStringArray(process.env.UPLOAD_ALLOWED_TYPES, [
        '.dwg',
        '.dxf',
        '.pdf',
        '.png',
        '.jpg',
        '.jpeg',
      ]),
      maxFilesPerUpload:
        parseInt(process.env.UPLOAD_MAX_FILES || '10', 10) || 10,
      allowedExtensions: parseStringArray(
        process.env.UPLOAD_ALLOWED_EXTENSIONS,
        ['.dwg', '.dxf']
      ),
      blockedExtensions: parseStringArray(
        process.env.UPLOAD_BLOCKED_EXTENSIONS,
        ['.exe', '.bat', '.sh', '.cmd', '.ps1']
      ),
      maxConcurrent:
        parseInt(process.env.UPLOAD_MAX_CONCURRENT || '3', 10) || 3,
      // 分片上传并发数（I/O 密集型，可以较高）
      chunkMaxConcurrent:
        parseInt(process.env.UPLOAD_CHUNK_MAX_CONCURRENT || '5', 10) || 5,
    },

    session: {
      secret: getRequiredEnv(
        'SESSION_SECRET',
        'dev-only-session-secret-change-me'
      ),
      maxAge:
        parseInt(process.env.SESSION_MAX_AGE || '86400000', 10) ||
        24 * 60 * 60 * 1000, // 24小时（Guard已修复有token强制验证，session仅是无token降级）
      name: process.env.SESSION_NAME || 'mxcad.sid',
      cookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      cookieSameSite:
        (process.env.SESSION_COOKIE_SAME_SITE as 'none' | 'lax' | 'strict') ||
        'lax',
      cookieSecure: parseCookieSecure(process.env.SESSION_COOKIE_SECURE),
    },

    cache: {
      l2DefaultTTL:
        parseInt(process.env.CACHE_L2_DEFAULT_TTL || '1800', 10) || 1800, // 30分钟
      versionMaxAge:
        parseInt(process.env.CACHE_VERSION_MAX_AGE || '3600000', 10) ||
        60 * 60 * 1000, // 1小时
    },

    userCleanup: {
      delayDays:
        parseInt(process.env.USER_CLEANUP_DELAY_DAYS || '30', 10) || 30,
      enabled: parseBoolean(process.env.ENABLE_USER_CLEANUP, true),
      cronExpression: process.env.USER_CLEANUP_CRON || '0 4 * * *',
    },

    fileLock: {
      timeout:
        parseInt(process.env.FILE_LOCK_TIMEOUT || '300000', 10) || 300000, // 5分钟
      retryInterval:
        parseInt(process.env.FILE_LOCK_RETRY_INTERVAL || '100', 10) || 100,
      maxRetries: parseInt(process.env.FILE_LOCK_MAX_RETRIES || '3', 10) || 3,
    },

    mail: {
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587', 10) || 587,
      secure: parseBoolean(process.env.MAIL_SECURE, false),
      user: process.env.MAIL_USER || '',
      pass: process.env.MAIL_PASS || '',
      from: process.env.MAIL_FROM || 'CloudCAD <noreply@cloudcad.com>',
    },

    // MxCAD 转换引擎配置（mxcad/conversion/file-conversion.service.ts 消费）
    mxcad: {
      assemblyPath: resolvePath(
        resolveMxExecutablePath(
          process.env.MXCAD_ASSEMBLY_PATH,
          'runtime/windows/mxcad/mxcadassembly.exe',
          'runtime/linux/mxcad/mxcadassembly'
        )
      ),
      fileExt: process.env.MXCAD_FILE_EXT || '.mxweb',
      compression: parseBoolean(process.env.MXCAD_COMPRESSION, true),
    },

    // 字体配置
    fonts: {
      backendPath: resolvePath(
        process.env.MXCAD_FONTS_PATH ||
          (isWindows
            ? 'runtime/windows/mxcad/fonts'
            : 'runtime/linux/mxcad/fonts')
      ),
      frontendPath: resolvePath(
        process.env.FRONTEND_FONTS_PATH || 'frontend/dist/mxcadAppAssets/fonts'
      ),
    },

    // 存储路径配置（默认在 data/ 目录下）
    filesDataPath,
    avatarPath: resolvePath(
      process.env.AVATAR_PATH || path.join(filesDataPath, 'avatars')
    ),
    mxRepoPath: resolvePath(process.env.MX_REPO_PATH || 'data/mx-repo'),
    mxcadUploadPath: resolvePath(
      process.env.MXCAD_UPLOAD_PATH || 'data/uploads'
    ),
    mxcadTempPath: resolvePath(process.env.MXCAD_TEMP_PATH || 'data/temp'),
    mxcadDebugPath: resolvePath(process.env.MXCAD_DEBUG_PATH || 'data/debug'),

    // 文件扩展名配置
    fileExtensions: {
      cad: parseStringArray(process.env.FILE_EXT_CAD, ['.dwg', '.dxf']),
      image: parseStringArray(process.env.FILE_EXT_IMAGE, [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.bmp',
        '.svg',
        '.webp',
      ]),
      document: parseStringArray(process.env.FILE_EXT_DOCUMENT, [
        '.pdf',
        '.doc',
        '.docx',
        '.xls',
        '.xlsx',
        '.ppt',
        '.pptx',
        '.txt',
      ]),
      archive: parseStringArray(process.env.FILE_EXT_ARCHIVE, [
        '.zip',
        '.rar',
        '.7z',
        '.tar',
        '.gz',
      ]),
      font: parseStringArray(process.env.FILE_EXT_FONT, [
        '.ttf',
        '.otf',
        '.woff',
        '.woff2',
        '.eot',
        '.shx',
      ]),
      forbidden: parseStringArray(process.env.FILE_EXT_FORBIDDEN, [
        '.exe',
        '.bat',
        '.sh',
        '.cmd',
        '.ps1',
        '.scr',
        '.vbs',
      ]),
    },

    // 缓存 TTL 配置（单位：秒）
    cacheTTL: {
      verificationCode:
        parseInt(process.env.CACHE_TTL_VERIFICATION_CODE || '900', 10) || 900, // 15分钟
      verificationRateLimit:
        parseInt(process.env.CACHE_TTL_VERIFICATION_RATE_LIMIT || '60', 10) ||
        60, // 1分钟
      tokenBlacklist:
        parseInt(process.env.CACHE_TTL_TOKEN_BLACKLIST || '604800', 10) ||
        604800, // 7天
      cacheVersion:
        parseInt(process.env.CACHE_TTL_CACHE_VERSION || '86400', 10) || 86400, // 24小时
      default: parseInt(process.env.CACHE_TTL_DEFAULT || '300', 10) || 300, // 5分钟
      mxcad: parseInt(process.env.CACHE_TTL_MXCAD || '300', 10) || 300, // 5分钟
      permission:
        parseInt(process.env.CACHE_TTL_PERMISSION || '300', 10) || 300, // 5分钟
      policy: parseInt(process.env.CACHE_TTL_POLICY || '600', 10) || 600, // 10分钟
    },

    // 文件限制配置
    fileLimits: {
      zipMaxTotalSize:
        parseInt(
          process.env.FILE_LIMIT_ZIP_MAX_TOTAL_SIZE || '2147483648',
          10
        ) || 2 * 1024 * 1024 * 1024, // 2GB
      zipMaxFileCount:
        parseInt(process.env.FILE_LIMIT_ZIP_MAX_FILE_COUNT || '10000', 10) ||
        10000,
      zipMaxDepth:
        parseInt(process.env.FILE_LIMIT_ZIP_MAX_DEPTH || '50', 10) || 50,
      zipMaxSingleFileSize:
        parseInt(
          process.env.FILE_LIMIT_ZIP_MAX_SINGLE_FILE_SIZE || '524288000',
          10
        ) || 500 * 1024 * 1024, // 500MB
      zipCompressionLevel:
        parseInt(process.env.FILE_LIMIT_ZIP_COMPRESSION_LEVEL || '1', 10) || 1,
      maxFilenameLength:
        parseInt(process.env.FILE_LIMIT_MAX_FILENAME_LENGTH || '255', 10) ||
        255,
      maxPathLength:
        parseInt(process.env.FILE_LIMIT_MAX_PATH_LENGTH || '1024', 10) || 1024,
      maxDirectoryDepth:
        parseInt(process.env.FILE_LIMIT_MAX_DIRECTORY_DEPTH || '10', 10) || 10,
      maxRecursionDepth:
        parseInt(process.env.FILE_LIMIT_MAX_RECURSION_DEPTH || '50', 10) || 50,
      maxHierarchyDepth:
        parseInt(process.env.FILE_LIMIT_MAX_HIERARCHY_DEPTH || '50', 10) || 50,
    },

    // 分页配置
    pagination: {
      defaultPageSize:
        parseInt(process.env.PAGINATION_DEFAULT_PAGE_SIZE || '50', 10) || 50,
      maxPageSize:
        parseInt(process.env.PAGINATION_MAX_PAGE_SIZE || '100', 10) || 100,
    },

    // 超时配置（单位：毫秒）
    timeout: {
      fileConversion:
        // 默认 3 分钟，与 conversion-service PRIORITY_CONFIG 1/2 级超时（180000ms）对齐：
        // 大图纸（十几 MB DWG、含外部参照）常超 60s，旧默认会把慢转换误杀成「文件转换超时」
        parseInt(process.env.TIMEOUT_FILE_CONVERSION || '180000', 10) || 180000,
      distributedLock:
        parseInt(process.env.TIMEOUT_DISTRIBUTED_LOCK || '5000', 10) || 5000, // 5秒
      rateLimiter:
        parseInt(process.env.TIMEOUT_RATE_LIMITER || '600000', 10) || 600000, // 10分钟
      directoryAllocator:
        parseInt(process.env.TIMEOUT_DIRECTORY_ALLOCATOR || '300000', 10) ||
        300000, // 5分钟
    },

    // 产品信息配置
    product: {
      name: process.env.PRODUCT_NAME || 'CloudCAD',
      defaultSender:
        process.env.PRODUCT_DEFAULT_SENDER || 'CloudCAD <noreply@cloudcad.com>',
    },

    // 缓存预热配置
    cacheWarmup: {
      maxUsers:
        parseInt(process.env.CACHE_WARMUP_MAX_USERS || '100', 10) || 100,
      maxProjects:
        parseInt(process.env.CACHE_WARMUP_MAX_PROJECTS || '50', 10) || 50,
    },

    // 存储配置
    storage: {
      nodeLimit:
        parseInt(process.env.FILES_NODE_LIMIT || '300000', 10) || 300000, // 单目录最大节点数
    },

    // MX 配置
    mx: {
      ignorePatterns: parseStringArray(process.env.MX_IGNORE_PATTERNS, [
        '*.mxweb',
        '*.dwg',
        '*.jpg',
      ]),
    },

    // 日志配置（ADR-0055 §1：日志落盘与脱敏，LOG_LEVELS 死配置已移除）
    log: {
      // 日志根目录（相对路径基于项目根解析）
      dir: resolvePath(process.env.LOG_DIR || 'data/logs'),
      // 应用/访问日志保留天数
      retentionDays:
        parseInt(process.env.LOG_RETENTION_DAYS || '180', 10) || 180,
      // 访问日志开关（默认开启，ADR-0055 §1）
      accessEnabled: process.env.LOG_ACCESS_ENABLED !== 'false',
      // 慢查询阈值（毫秒），超过此阈值的 SQL 会打印日志（仅开发环境生效）
      slowQueryThresholdMs:
        parseInt(process.env.LOG_SLOW_QUERY_THRESHOLD_MS || '500', 10) || 500,
    },

    // 支付配置
    // 注意：支付开关（paymentEnabled）已迁移到运行时配置系统
    // payment.provider 环境变量仅在生产模式生效
    payment: {
      provider:
        (process.env.PAYMENT_PROVIDER as 'mock' | 'wechat_pay') || 'mock',
    },

    // 微信支付配置
    wechatPay: {
      appId: process.env.WECHATPAY_APPID || '',
      mchId: process.env.WECHATPAY_MCHID || '',
      key: process.env.WECHATPAY_KEY || '',
      signType:
        (process.env.WECHATPAY_SIGN_TYPE as 'MD5' | 'HMAC-SHA256') || 'MD5',
      notifyUrl: process.env.WECHATPAY_NOTIFY_URL || '',
      certPath: resolvePath(process.env.WECHATPAY_CERT_PATH || ''),
      keyPath: resolvePath(process.env.WECHATPAY_KEY_PATH || ''),
    },

    // 短信配置
    // 注意：短信服务开关（smsEnabled）已迁移到运行时配置系统
    // 可在管理界面动态开启/关闭，无需重启服务
    sms: {
      provider:
        (process.env.SMS_PROVIDER as 'aliyun' | 'tencent' | 'mock') || 'mock',
      aliyun: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
        accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        signName: process.env.ALIYUN_SMS_SIGN_NAME || '',
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '',
        regionId: process.env.ALIYUN_SMS_REGION_ID || 'cn-hangzhou',
      },
      tencent: {
        secretId: process.env.TENCENT_SECRET_ID || '',
        secretKey: process.env.TENCENT_SECRET_KEY || '',
        appId: process.env.TENCENT_SMS_APP_ID || '',
        signName: process.env.TENCENT_SMS_SIGN_NAME || '',
        templateCode: process.env.TENCENT_SMS_TEMPLATE_CODE || '',
        region: process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
      },
      limits: {
        // 每个手机号每日发送上限，默认 10 次
        dailyLimitPerPhone: parseInt(
          process.env.SMS_DAILY_LIMIT_PER_PHONE || '10',
          10
        ),
        // 每个 IP 每小时发送上限，默认 20 次
        hourlyLimitPerIp: parseInt(
          process.env.SMS_HOURLY_LIMIT_PER_IP || '20',
          10
        ),
      },
    },

    // 协同服务配置
    cooperate: {
      url: process.env.COOPERATE_URL || 'http://localhost:3091',
    },

    // 账号维度限流配置（防撞库/暴力破解；IP 维度限流见 RateLimitGuard）
    // max 设为 0 可关闭对应维度的限流
    authRateLimit: {
      loginMax: parseInt(process.env.AUTH_RATE_LIMIT_LOGIN_MAX || '5', 10),
      loginWindowSeconds: parseInt(
        process.env.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS || '60',
        10
      ),
      passwordResetMax: parseInt(
        process.env.AUTH_RATE_LIMIT_PASSWORD_RESET_MAX || '5',
        10
      ),
      passwordResetWindowSeconds: parseInt(
        process.env.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS || '3600',
        10
      ),
      registerMax: parseInt(
        process.env.AUTH_RATE_LIMIT_REGISTER_MAX || '5',
        10
      ),
      registerWindowSeconds: parseInt(
        process.env.AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS || '3600',
        10
      ),
      // 下单限流：资金接口，比登录更严格（防脚本刷单消耗微信 API 配额）
      orderCreateMax: parseInt(
        process.env.AUTH_RATE_LIMIT_ORDER_CREATE_MAX || '10',
        10
      ),
      orderCreateWindowSeconds: parseInt(
        process.env.AUTH_RATE_LIMIT_ORDER_CREATE_WINDOW_SECONDS || '3600',
        10
      ),
    },

    // 口令策略配置（#416 等保 8.1.4.1 a)/b)）
    // 复杂度：≥minLength 位 + 大小写/数字/特殊字符四类至少三类 + 弱口令黑名单
    // 定期更换（仅 ADMIN 角色生效）：maxAgeDays 天到期强制改密，提前 expiringSoonDays 天提示
    passwordPolicy: {
      minLength: parseInt(process.env.PASSWORD_POLICY_MIN_LENGTH || '10', 10),
      maxAgeDays: parseInt(process.env.PASSWORD_POLICY_MAX_AGE_DAYS || '180', 10),
      expiringSoonDays: parseInt(
        process.env.PASSWORD_POLICY_EXPIRING_SOON_DAYS || '14',
        10
      ),
      // 定期更换 / 首登未改密「强制改密」总开关（默认关闭；PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED=true 开启，仅 ADMIN 角色）
      changeEnforceEnabled: parseBoolean(
        process.env.PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED,
        false
      ),
    },

    // 账号失败锁定配置（#416 等保 8.1.4.1 c) 防暴力破解）
    // 与 authRateLimit（5次/60s 频率限流）独立叠加：failThreshold 次失败（windowSeconds 窗口内）→ 锁 durationSeconds
    // 锁期内正确密码也拒绝并告知剩余时间，到期自愈；Redis 故障降级进程内计数
    accountLock: {
      failThreshold: parseInt(process.env.AUTH_LOCK_FAIL_THRESHOLD || '10', 10),
      windowSeconds: parseInt(
        process.env.AUTH_LOCK_WINDOW_SECONDS || '900',
        10
      ),
      durationSeconds: parseInt(
        process.env.AUTH_LOCK_DURATION_SECONDS || '1800',
        10
      ),
    },

    // 审计日志配置（#207/ADR-0045；#322：默认 183 天（>6 个月整）+ 按月归档 CSV）
    audit: {
      retentionDays:
        parseInt(
          process.env.AUDIT_LOG_RETENTION_DAYS ||
            process.env.AUDIT_RETENTION_DAYS ||
            '183',
          10
        ) || 183,
      // #322 fail-closed：true 时超期记录先按月归档 CSV + SHA-256 清单，成功才删库；
      // false 时直接按保留天数删除。等保 8.4.3.3/8.4.7.2 验收需开启。
      archiveEnabled: parseBoolean(process.env.AUDIT_ARCHIVE_ENABLED, false),
      archivePath: resolvePath(
        process.env.AUDIT_ARCHIVE_PATH || 'data/archives/audit-logs'
      ),
    },

    // 后台任务执行记录保留策略（#271 无界增长治理；#326 默认 180 天，运维排查窗口与等保对齐）
    taskRun: {
      retentionDays:
        parseInt(process.env.TASK_RUN_RETENTION_DAYS || '180', 10) || 180,
    },

    // 数据库备份配置（#318：每日全量 pg_dump -Fc + 本地轮转；#320：月度恢复演练）
    backup: {
      enabled: parseBoolean(process.env.BACKUP_ENABLED, true),
      dir: resolvePath(process.env.BACKUP_DIR || 'data/backups'),
      keepLocal: parseInt(process.env.BACKUP_KEEP_LOCAL || '14', 10) || 14,
      cron: process.env.BACKUP_CRON || '0 1 * * *',
      pgDumpPath: process.env.PG_DUMP_PATH || '',
      drillEnabled: parseBoolean(process.env.BACKUP_DRILL_ENABLED, true),
      drillTables: (
        process.env.BACKUP_DRILL_TABLES ||
        'audit_logs,alert_records,task_runs,users'
      )
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      // 异地推送（#319，ADR-0055 §5：none/rsync/oss/s3 三通道可配，失败告警 P1）
      remote: {
        type: (process.env.BACKUP_REMOTE_TYPE || 'none') as AppConfig['backup']['remote']['type'],
        host: process.env.BACKUP_REMOTE_HOST || '',
        user: process.env.BACKUP_REMOTE_USER || '',
        path: process.env.BACKUP_REMOTE_PATH || '',
        keep:
          parseInt(process.env.BACKUP_REMOTE_KEEP || '14', 10) || 14,
        endpoint: process.env.BACKUP_REMOTE_ENDPOINT || '',
        bucket: process.env.BACKUP_REMOTE_BUCKET || '',
        accessKey: process.env.BACKUP_REMOTE_ACCESS_KEY || '',
        secret: process.env.BACKUP_REMOTE_SECRET || '',
        rsyncPath: process.env.BACKUP_RSYNC_PATH || '',
        ossutilPath: process.env.BACKUP_OSSUTIL_PATH || '',
        awsCliPath: process.env.BACKUP_AWS_CLI_PATH || '',
      },
    },

    // 告警邮件通知（#311：P0 实时邮件 + 恢复通知 + 连续失败升级）
    alertEmail: {
      enabled: (process.env.ALERT_EMAIL_ENABLED || 'false') === 'true',
      to: (process.env.ALERT_EMAIL_TO || '')
        .split(',')
        .map((addr) => addr.trim())
        .filter(Boolean),
      failEscalate:
        parseInt(process.env.ALERT_EMAIL_FAIL_ESCALATE || '5', 10) || 5,
      p1WindowMinutes:
        parseInt(process.env.ALERT_P1_WINDOW_MINUTES || '15', 10) || 15,
      p2DailyHour: (() => {
        const h = parseInt(process.env.ALERT_P2_DAILY_HOUR || '9', 10);
        return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9;
      })(),
    },

    // /metrics 抓取令牌认证（#315）：配置后 Prometheus 可用 Bearer/Basic 抓取令牌访问
    // /api/metrics；未配置时保持原有 SYSTEM_MONITOR 权限控制（兼容现有行为）
    metrics: {
      scrapeToken: process.env.SCRAPE_TOKEN || '',
      // 主机级指标磁盘采样路径（ADR-0055 §4 / #316）：逗号分隔，默认进程工作目录
      hostDiskPaths: (process.env.HOST_METRIC_DISK_PATHS || process.cwd())
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    },

    // 管理员登录 IP 白名单本地文件兜底通道（相对路径基于项目根目录解析）
    adminIpWhitelist: {
      file: resolvePath(
        process.env.ADMIN_IP_WHITELIST_FILE || 'config/admin-ip-whitelist.json'
      ),
      // 可信反向代理地址段：反代部署时在此配置代理 IP，白名单判定才信任 XFF 最右侧。
      // 默认含本机环回（127.0.0.1/::1），直连部署无需配置。
      trustedProxies: (process.env.ADMIN_TRUSTED_PROXY_IPS || '127.0.0.1,::1')
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean),
    },

    // 批量下载配置
    batchDownload: {
      exportDir: resolvePath(
        process.env.BATCH_DOWNLOAD_EXPORT_DIR || 'data/exports'
      ),
      minDiskSpace:
        parseInt(
          process.env.BATCH_DOWNLOAD_MIN_DISK_SPACE || '524288000',
          10
        ) || 524288000, // 500MB
      zipRetentionHours:
        parseInt(process.env.BATCH_DOWNLOAD_ZIP_RETENTION_HOURS || '24', 10) ||
        24,
      dbRetentionDays:
        parseInt(process.env.BATCH_DOWNLOAD_DB_RETENTION_DAYS || '7', 10) || 7,
      // 批量下载进程内转换并行度（Semaphore）。默认 2：8 核机器上 3 个重格式并发 + 常驻服务
      // 会抢光 CPU 致单转换 >60s 超时失败（ADR-0060 事故根因）；削到 2 让单转换 CPU 充足、
      // 60s 内转完 → 结果缓存能落盘 → 破「失败→重提交」循环。可按机器核数经 env 调。
      maxConcurrency:
        parseInt(process.env.BATCH_DOWNLOAD_MAX_CONCURRENCY || '2', 10) || 2,
      // 批量转换是否委托 conversion-service 服务（默认关闭，走进程内 mxcad conversionService）
      delegateWorkflow: parseBoolean(
        process.env.BATCH_DOWNLOAD_DELEGATE_WORKFLOW,
        false
      ),
      // conversion-service 服务地址
      conversionServiceUrl:
        process.env.CONVERSION_SERVICE_URL || 'http://localhost:3100',
      // workflow 任务轮询间隔（毫秒）
      workflowPollIntervalMs:
        parseInt(
          process.env.BATCH_DOWNLOAD_WORKFLOW_POLL_INTERVAL_MS || '1500',
          10
        ) || 1500,
      // workflow 任务轮询超时（毫秒）
      workflowTimeoutMs:
        parseInt(
          process.env.BATCH_DOWNLOAD_WORKFLOW_TIMEOUT_MS || '600000',
          10
        ) || 600000,
      // 多格式下载转换产物缓存目录（位于 exportDir 下；命中缓存免转换秒回，见 FileDownloadExportService）
      conversionCacheDir: resolvePath(
        process.env.CONVERSION_CACHE_DIR || 'data/exports/conversion-cache'
      ),
      // 转换产物缓存 TTL（小时）；命中时惰性检查 mtime，超期删除并重转。0 = 不启用缓存
      conversionCacheTtlHours:
        parseInt(process.env.CONVERSION_CACHE_TTL_HOURS || '168', 10) || 0,
    },

    // 缩略图自动生成配置
    thumbnail: {
      // MxWebDwg2Jpg 路径，用于将 mxweb 转换为 jpg 缩略图
      dwg2JpgPath: resolvePath(
        resolveMxExecutablePath(
          process.env.MXCAD_DWG2JPG_PATH,
          'runtime/windows/mxcad/tool/MxWebDwg2Jpg.exe',
          'runtime/linux/mxcad/tool/MxWebDwg2Jpg'
        )
      ),
      // 是否启用后端自动生成缩略图
      autoGenerateEnabled: parseBoolean(
        process.env.THUMBNAIL_AUTO_GENERATE_ENABLED,
        true
      ),
      // 缩略图宽度（像素），默认 300
      width: parseInt(process.env.THUMBNAIL_WIDTH || '300', 10) || 300,
      // 缩略图高度（像素），默认300  如果是0 表示自动计算保持原始宽高比
      height: parseInt(process.env.THUMBNAIL_HEIGHT || '300', 10) || 300,
      // 缩略图背景颜色，十六进制 RGB 格式，默认黑色
      backgroundColor: process.env.THUMBNAIL_BACKGROUND_COLOR || '0x000000',
    },
  };
};
