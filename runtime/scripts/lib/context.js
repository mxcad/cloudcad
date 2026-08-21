/**
 * @fileoverview 运行时上下文 —— 单一事实源
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - PLATFORM/IS_WINDOWS/IS_LINUX：cli.js:47-49
 * - PROJECT_ROOT/RUNTIME_DIR/PLATFORM_DIR：cli.js:51-55
 * - USE_RUNTIME/DATA_DIR/PM2_HOME：cli.js:57-59
 * - BACKEND_ENV_PATH：cli.js:107
 * - getPorts/PORTS：cli.js:108-143
 * - NODE_EXE/PM2_JS/PM2_CMD/PNPM_JS：cli.js:146-175
 * - getMobileAccessPath：cli.js:61-81
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 * 本模块被 lib/logger、lib/proc、lib/health、commands/* 引用。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseEnvFileSimple } = require('./env');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..', '..');
const PLATFORM_DIR = IS_WINDOWS
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');

// 从 myServerConfig.json 读取移动端访问路径名
function getMobileAccessPath() {
  const root = PROJECT_ROOT;
  const configPaths = [
    path.join(root, 'data', 'configs', 'frontend', 'ini', 'myServerConfig.json'),
    path.join(root, 'packages', 'frontend', 'public', 'ini', 'myServerConfig.json'),
  ];
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mobileAccessPath && typeof config.mobileAccessPath === 'string') {
          return config.mobileAccessPath;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  return 'mxcad_mobile';
}

const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

// 基础服务 PM2 app 名清单（单一事实源：infra/start/stop/verify 共享）
// 顺序即 ecosystem.config.js 中注册的 app name。
const INFRA_SERVICE_APPS = ['config-service', 'cooperate', 'postgresql', 'redis'];

// 基础服务：PM2 app 名 → 端口 key 的映射（用于重复实例检测与端口查询）
const INFRA_APP_TO_PORT_KEY = {
  'config-service': 'configService',
  cooperate: 'cooperate',
  postgresql: 'postgresql',
  redis: 'redis',
};

// 从 .env 文件读取端口配置
function getPorts() {
  const defaults = {
    backend: 3001,
    frontend: 3000,
    configService: 3002,
    postgresql: 5432,
    redis: 6379,
    cooperate: 3091,
  };

  if (!fs.existsSync(BACKEND_ENV_PATH)) {
    return defaults;
  }

  try {
    const envConfig = parseEnvFileSimple(BACKEND_ENV_PATH);
    return {
      backend: parseInt(envConfig.PORT || '3001', 10) || defaults.backend,
      frontend:
        parseInt(envConfig.FRONTEND_PORT || '3000', 10) || defaults.frontend,
      configService:
        parseInt(envConfig.CONFIG_SERVICE_PORT || '3002', 10) ||
        defaults.configService,
      postgresql:
        parseInt(envConfig.DB_PORT || '5432', 10) || defaults.postgresql,
      redis: parseInt(envConfig.REDIS_PORT || '6379', 10) || defaults.redis,
      cooperate:
        parseInt(envConfig.COOPERATE_PORT || '3091', 10) || defaults.cooperate,
    };
  } catch (err) {
    return defaults;
  }
}

// 端口配置（动态读取）
let PORTS = getPorts();

// 可执行文件路径
const NODE_EXE = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'node', 'node.exe')
    : path.join(PLATFORM_DIR, 'node', 'bin', 'node')
  : 'node';

const PM2_JS = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2')
    : path.join(
        PLATFORM_DIR,
        'node',
        'node_modules',
        'pm2',
        'bin',
        'pm2'
      )
  : null;

// PM2 包装脚本路径（确保 PM2 daemon 能找到 node）
const PM2_CMD = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PROJECT_ROOT, 'pm2.cmd')
    : path.join(PROJECT_ROOT, 'node', 'bin','pm2')
  : 'pm2';

// 使用真正的 pnpm.cjs，而不是 corepack 代理（离线环境下 corepack 会尝试联网）
const PNPM_JS = USE_RUNTIME
  ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  : path.join(PLATFORM_DIR, 'node', 'bin', 'pnpm');

module.exports = {
  PLATFORM,
  IS_WINDOWS,
  IS_LINUX,
  PROJECT_ROOT,
  RUNTIME_DIR,
  PLATFORM_DIR,
  USE_RUNTIME,
  DATA_DIR,
  PM2_HOME,
  BACKEND_ENV_PATH,
  PORTS,
  getPorts,
  getMobileAccessPath,
  NODE_EXE,
  PM2_JS,
  PM2_CMD,
  PNPM_JS,
  INFRA_SERVICE_APPS,
  INFRA_APP_TO_PORT_KEY,
};
