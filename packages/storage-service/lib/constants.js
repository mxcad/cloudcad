const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.STORAGE_SERVICE_PORT || '3200', 10);
const FILES_DATA_PATH = process.env.FILES_DATA_PATH || path.join(os.homedir(), 'filesData');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// JWT 验证
const JWT_SECRET = process.env.BACKEND_JWT_SECRET || '';

// #419：内网服务间共享密钥（非 health 路由校验；空值=未启用，向后兼容本地开发）
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || '';

// LRU 缓存配置
const LRU_CONFIG = {
  maxSize: parseInt(process.env.STORAGE_CACHE_MAX_SIZE || '100', 10),
  maxFileSize: parseInt(process.env.STORAGE_CACHE_MAX_FILE_SIZE || '10485760', 10),
  ttlMs: parseInt(process.env.STORAGE_CACHE_TTL_MS || '300000', 10),
};

// 路由表路径
const ROUTING_TABLE_PATH = process.env.STORAGE_ROUTING_TABLE
  || path.join(PROJECT_ROOT, 'config', 'storage-routing.json');

// SVN 配置
const SVN_CONFIG = {
  mxToolPath: process.env.MX_VERSION_TOOL_PATH || path.join(PROJECT_ROOT, 'packages', 'mxVersionTool', 'mxcmd.js'),
};

module.exports = { PORT, FILES_DATA_PATH, PROJECT_ROOT, JWT_SECRET, INTERNAL_SERVICE_SECRET, LRU_CONFIG, ROUTING_TABLE_PATH, SVN_CONFIG };
