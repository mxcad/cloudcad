const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.CONVERSION_SERVICE_PORT || '3100', 10);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// 优先级配置: 每级独立信号量池
// - timeout: 单次转换的执行超时（传给 runner.execute 的命令执行超时）
// - acquireTimeout: 排队等待信号量许可的单次等待上限，与执行超时语义区分。
//   取 timeout 的 1/3（120s→40s / 180s→60s / 60s→20s）：
//   排队只是等待而非执行，等待时长不应与执行超时同量级；
//   按执行超时比例缩放，使长耗时优先级（export）可容忍更长排队、短耗时优先级（thumbnail）更快重试。
//   注意：等待超时并非丢弃任务——acquire 返回 false 仅放弃本次等待，
//   任务保持 PENDING 由下一轮 _tick 重新排队，因此该值只影响单次等待上限。
const PRIORITY_CONFIG = {
  1: { label: 'upload', maxConcurrent: 2, timeout: 120000, acquireTimeout: 40000 },
  2: { label: 'export', maxConcurrent: 2, timeout: 180000, acquireTimeout: 60000 },
  3: { label: 'thumbnail', maxConcurrent: 1, timeout: 60000, acquireTimeout: 20000 },
};

const MXCAD_CONFIG = {
  assemblyPath: process.env.MXCAD_ASSEMBLY_PATH || (
    os.platform() === 'linux'
      ? path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad', 'mxcadassembly')
      : path.join(PROJECT_ROOT, 'runtime', 'windows', 'mxcad', 'mxcadassembly.exe')
  ),
  binPath: os.platform() === 'linux' ? path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad') : '',
  maxBuffer: 50 * 1024 * 1024,
};

const QUEUE_DRIVER = (process.env.QUEUE_DRIVER || 'local').toLowerCase();
const REDIS_URL = process.env.REDIS_URL || '';

// 批量转换等管理类路由的共享密钥（后端调用方需带 X-Conversion-Service-Secret 头）
// 未配置时跳过校验（本地开发/内网部署向后兼容）
const CONVERSION_SERVICE_SECRET = process.env.CONVERSION_SERVICE_SECRET || '';

// 工作池按积压自动扩容
const WORKER_POOL_AUTO_SCALE = (process.env.WORKER_POOL_AUTO_SCALE || 'true') === 'true';
const WORKER_POOL_MAX_MULTIPLIER = parseInt(process.env.WORKER_POOL_MAX_MULTIPLIER || '2', 10);
const WORKER_POOL_MAX_CONCURRENT = parseInt(process.env.WORKER_POOL_MAX_CONCURRENT || '8', 10);
const WORKER_POOL_BACKLOG_THRESHOLD = parseInt(process.env.WORKER_POOL_BACKLOG_THRESHOLD || '2', 10);
const WORKER_POOL_BACKLOG_WINDOW_MS = parseInt(process.env.WORKER_POOL_BACKLOG_WINDOW_MS || '2000', 10);

const CALLBACK_TIMEOUT = parseInt(process.env.CALLBACK_TIMEOUT || '10000', 10);

module.exports = {
  PORT,
  PROJECT_ROOT,
  PRIORITY_CONFIG,
  MXCAD_CONFIG,
  QUEUE_DRIVER,
  REDIS_URL,
  CONVERSION_SERVICE_SECRET,
  WORKER_POOL_AUTO_SCALE,
  WORKER_POOL_MAX_MULTIPLIER,
  WORKER_POOL_MAX_CONCURRENT,
  WORKER_POOL_BACKLOG_THRESHOLD,
  WORKER_POOL_BACKLOG_WINDOW_MS,
  CALLBACK_TIMEOUT,
};
