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

import { AppConfig } from './app.config';
import * as path from 'path';
import * as os from 'os';

/**
 * 判断当前操作系统是否为 Windows
 */
const isWindows = os.platform() === 'win32';

/**
 * 解析路径为绝对路径
 * 如果是相对路径，基于项目根目录（apps/backend 的上两级）解析
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

  // 相对路径：基于项目根目录解析
  // process.cwd() 通常是 apps/backend，项目根目录是其上两级
  const projectRoot = path.join(process.cwd(), '..', '..');
  return path.resolve(projectRoot, inputPath);
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

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3001', 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'cloudcad',
    ssl: parseBoolean(process.env.DB_SSL, false),
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10) || 20,
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
    // 使用固定上限值 500MB，业务层使用运行时配置 maxFileSize 进行精确限制
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
    maxFilesPerUpload: parseInt(process.env.UPLOAD_MAX_FILES || '10', 10) || 10,
    allowedExtensions: parseStringArray(process.env.UPLOAD_ALLOWED_EXTENSIONS, [
      '.dwg',
      '.dxf',
    ]),
    blockedExtensions: parseStringArray(process.env.UPLOAD_BLOCKED_EXTENSIONS, [
      '.exe',
      '.bat',
      '.sh',
      '.cmd',
      '.ps1',
    ]),
    maxConcurrent: parseInt(process.env.UPLOAD_MAX_CONCURRENT || '3', 10) || 3,
    // 分片上传并发数（I/O 密集型，可以较高）
    chunkMaxConcurrent:
      parseInt(process.env.UPLOAD_CHUNK_MAX_CONCURRENT || '5', 10) || 5,
  },

  session: {
    secret:
      process.env.SESSION_SECRET ||
      process.env.JWT_SECRET ||
      'mxcad-session-secret-key-change-in-production',
    maxAge:
      parseInt(process.env.SESSION_MAX_AGE || '86400000', 10) ||
      24 * 60 * 60 * 1000, // 24小时
    name: process.env.SESSION_NAME || 'mxcad.sid',
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    cookieSameSite:
      (process.env.SESSION_COOKIE_SAME_SITE as 'none' | 'lax' | 'strict') ||
      'lax',
    cookieSecure: parseBoolean(
      process.env.SESSION_COOKIE_SECURE,
      process.env.NODE_ENV === 'production'
    ),
  },

  cache: {
    l2DefaultTTL:
      parseInt(process.env.CACHE_L2_DEFAULT_TTL || '1800', 10) || 1800, // 30分钟
    versionMaxAge:
      parseInt(process.env.CACHE_VERSION_MAX_AGE || '3600000', 10) ||
      60 * 60 * 1000, // 1小时
  },

  userCleanup: {
    delayDays: parseInt(process.env.USER_CLEANUP_DELAY_DAYS || '30', 10) || 30,
    enabled: parseBoolean(process.env.ENABLE_USER_CLEANUP, true),
    cronExpression: process.env.USER_CLEANUP_CRON || '0 4 * * *',
  },

  fileLock: {
    timeout: parseInt(process.env.FILE_LOCK_TIMEOUT || '300000', 10) || 300000, // 5分钟
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

  mxcad: {
    assemblyPath: resolvePath(
      process.env.MXCAD_ASSEMBLY_PATH ||
        (isWindows
          ? 'runtime/windows/mxcad/mxcadassembly.exe'
          : 'runtime/linux/mxcad/mxcadassembly')
    ),
    fileExt: process.env.MXCAD_FILE_EXT || '.mxweb',
    compression: parseBoolean(process.env.MXCAD_COMPRESSION, true),
    fontsPath: resolvePath(
      process.env.MXCAD_FONTS_PATH ||
        (isWindows
          ? 'runtime/windows/mxcad/fonts'
          : 'runtime/linux/mxcad/fonts')
    ),
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
  filesDataPath: resolvePath(process.env.FILES_DATA_PATH || 'data/files'),
  svnRepoPath: resolvePath(process.env.SVN_REPO_PATH || 'data/svn-repo'),
  mxcadUploadPath: resolvePath(process.env.MXCAD_UPLOAD_PATH || 'data/uploads'),
  mxcadTempPath: resolvePath(process.env.MXCAD_TEMP_PATH || 'data/temp'),

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
      parseInt(process.env.CACHE_TTL_VERIFICATION_RATE_LIMIT || '60', 10) || 60, // 1分钟
    tokenBlacklist:
      parseInt(process.env.CACHE_TTL_TOKEN_BLACKLIST || '604800', 10) || 604800, // 7天
    cacheVersion:
      parseInt(process.env.CACHE_TTL_CACHE_VERSION || '86400', 10) || 86400, // 24小时
    default: parseInt(process.env.CACHE_TTL_DEFAULT || '300', 10) || 300, // 5分钟
    mxcad: parseInt(process.env.CACHE_TTL_MXCAD || '300', 10) || 300, // 5分钟
    permission: parseInt(process.env.CACHE_TTL_PERMISSION || '300', 10) || 300, // 5分钟
    policy: parseInt(process.env.CACHE_TTL_POLICY || '600', 10) || 600, // 10分钟
  },

  // 文件限制配置
  fileLimits: {
    zipMaxTotalSize:
      parseInt(process.env.FILE_LIMIT_ZIP_MAX_TOTAL_SIZE || '2147483648', 10) ||
      2 * 1024 * 1024 * 1024, // 2GB
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
      parseInt(process.env.FILE_LIMIT_MAX_FILENAME_LENGTH || '255', 10) || 255,
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
      parseInt(process.env.TIMEOUT_FILE_CONVERSION || '60000', 10) || 60000, // 1分钟
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
    maxUsers: parseInt(process.env.CACHE_WARMUP_MAX_USERS || '100', 10) || 100,
    maxProjects:
      parseInt(process.env.CACHE_WARMUP_MAX_PROJECTS || '50', 10) || 50,
  },

  // 存储配置
  storage: {
    nodeLimit: parseInt(process.env.FILES_NODE_LIMIT || '300000', 10) || 300000, // 单目录最大节点数
  },

  // SVN 配置
  svn: {
    ignorePatterns: parseStringArray(process.env.SVN_IGNORE_PATTERNS, [
      '*.mxweb',
      '*.dwg',
      '*.jpg',
    ]),
  },

  // 日志配置
  log: {
    levels: parseLogLevels(
      process.env.LOG_LEVELS,
      process.env.NODE_ENV || 'development'
    ),
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
      templateId: process.env.TENCENT_SMS_TEMPLATE_ID || '',
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

  // 缩略图自动生成配置
  thumbnail: {
    // MxWebDwg2Jpg 路径，用于将 mxweb 转换为 jpg 缩略图
    dwg2JpgPath: resolvePath(
      process.env.MXCAD_DWG2JPG_PATH ||
        (isWindows
          ? 'runtime/windows/mxcad/tool/MxWebDwg2Jpg.exe'
          : 'runtime/linux/mxcad/tool/MxWebDwg2Jpg')
    ),
    // 是否启用后端自动生成缩略图
    autoGenerateEnabled: parseBoolean(
      process.env.THUMBNAIL_AUTO_GENERATE_ENABLED,
      true
    ),
    // 缩略图宽度（像素），默认 120
    width: parseInt(process.env.THUMBNAIL_WIDTH || '120', 10) || 100,
    // 缩略图高度（像素），默认120  如果是0 表示自动计算保持原始宽高比
    height: parseInt(process.env.THUMBNAIL_HEIGHT || '120', 10) || 0,
    // 缩略图背景颜色，十六进制 RGB 格式，默认黑色
    backgroundColor: process.env.THUMBNAIL_BACKGROUND_COLOR || '0x000000',
  },
});

/**
 * 解析日志级别配置
 * @param value 环境变量值
 * @param nodeEnv 运行环境
 * @returns 日志级别数组
 */
function parseLogLevels(
  value: string | undefined,
  nodeEnv: string
): ('error' | 'warn' | 'log' | 'debug' | 'verbose')[] {
  if (value) {
    return value
      .split(',')
      .map((l) => l.trim() as 'error' | 'warn' | 'log' | 'debug' | 'verbose');
  }
  // 开发环境默认启用全部级别
  if (nodeEnv === 'development') {
    return ['error', 'warn', 'log', 'debug', 'verbose'];
  }
  // 生产环境默认只启用基础级别
  return ['error', 'warn', 'log'];
}
