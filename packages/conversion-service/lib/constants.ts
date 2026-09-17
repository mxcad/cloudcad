import './env'; // 须在读取下方任何 process.env 之前加载 .env/.env.local
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.CONVERSION_SERVICE_PORT || '3100', 10);

// PROJECT_ROOT 定位：从 __dirname 向上逐层查找含 runtime/ 的目录（项目根，mxcad 二进制在
// runtime/{windows|linux}/mxcad/ 下）。tsconfig rootDir="."+outDir="dist"，编译产物
// dist/lib/constants.js 比源码 lib/ 深一层——写死 path.resolve(__dirname,'..','..','..')
// 会从 dist/lib/ 只爬到 packages/（少爬一层 dist），致 assemblyPath 指向不存在的
// packages/runtime/... → spawn ENOENT（被 runner 误判成确定性内容失败、污染负缓存）。
// 向上查找与嵌套深度无关：源码 lib/、编译 dist/lib/、部署包布局（runtime/ 恒在根）均正确。
// 找不到 runtime/（如 CI 无 runtime 资产）时回退旧的 3 层解析，保持向后兼容。
function resolveProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'runtime'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..', '..');
}

const PROJECT_ROOT = resolveProjectRoot();

// 优先级配置: 每级独立信号量池。worker 按 level 1→3 顺序调度（level 1 最先）。
// 优先级由 backend 按入口类型指定（body.priority）：打开/预览=1（命脉）、导出=2、后台=3。
// - timeout: 单次转换的执行超时（传给 runner.execute 的命令执行超时）
// - acquireTimeout: 排队等待信号量许可的单次等待上限，与执行超时语义区分（取 timeout 的 1/3）。
//   等待超时并非丢弃任务——acquire 返回 false 仅放弃本次等待，任务保持 PENDING 由下一轮 _tick 重新排队。
//
// #431 门禁5 优先级重排：打开/预览是用户体验命脉，须排最高（level 1）；
// 上传预转/缩略图/批量下载属后台（level 3），可容忍长排队。
const PRIORITY_CONFIG: Record<string, PriorityConfig> = {
  // 1 = 打开/预览（用户正等着打开图纸，最高优先）
  1: { label: 'open', maxConcurrent: 2, timeout: 180000, acquireTimeout: 60000 },
  // 2 = 导出下载（用户主动触发，次于打开）
  2: { label: 'export', maxConcurrent: 2, timeout: 180000, acquireTimeout: 60000 },
  // 3 = 后台（上传预转/缩略图/批量下载，最低优先，可容忍长排队）
  3: { label: 'background', maxConcurrent: 1, timeout: 120000, acquireTimeout: 40000 },
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

// #419 等保 8.1.2.2：内部服务统一共享密钥（可信内网隔离路线的鉴权层）。
// 后端对所有非 health 路由带 X-Internal-Service-Secret 头；本服务校验该头。
// 与既有 CONVERSION_SERVICE_SECRET 并存：任一匹配即放行（向后兼容 batchConvert 旧链路）。
// 两者均未配置时跳过校验（本地开发向后兼容）。
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || '';

// 鉴权门禁（S1-1 生产忘配密钥防裸奔）：两密钥均未配置时是否拒绝请求。
// 默认值随环境：NODE_ENV=production → true（生产忘配密钥不再裸奔），其他环境 → false
// （本地开发/内网部署向后兼容，无需配密钥即可运行）。显式 CONVERSION_SERVICE_REQUIRE_AUTH
// =true/false 可覆盖默认（如内网部署想强制门禁设 true，本地调试想放宽设 false）。
const REQUIRE_AUTH_DEFAULT = process.env.NODE_ENV === 'production';
const REQUIRE_AUTH_RAW = process.env.CONVERSION_SERVICE_REQUIRE_AUTH;
const CONVERSION_SERVICE_REQUIRE_AUTH =
  REQUIRE_AUTH_RAW !== undefined ? REQUIRE_AUTH_RAW === 'true' : REQUIRE_AUTH_DEFAULT;

// 工作池按积压自动扩容。
// 默认关闭（#431 门禁2）：mxcadassembly 是 CPU 密集单进程，8-28 CPU 打满死机事故
// 正是 >3 并发打满 8 核所致；自动扩容（积压即翻倍、全局上限 8）在单机是事故放大器。
// 需按 docs/elastic-conversion-architecture.md 容量公式（并发 ≤ 物理核数）显式开启。
const WORKER_POOL_AUTO_SCALE = (process.env.WORKER_POOL_AUTO_SCALE || 'false') === 'true';
const WORKER_POOL_MAX_MULTIPLIER = parseInt(process.env.WORKER_POOL_MAX_MULTIPLIER || '2', 10);
// 全局并发上限默认 = min(8, 逻辑核数)（容量公式：并发 ≤ 物理核数，内存 = 并发 × 4GB）。
// os.cpus().length 为逻辑核（含超线程，是物理核的上界）——即使显式开启自动扩容，
// 各优先级并发之和也不会超过该上限；严格物理核合规请按硬件显式设 WORKER_POOL_MAX_CONCURRENT。
const PHYSICAL_CORES = os.cpus().length;
const WORKER_POOL_MAX_CONCURRENT = parseInt(
  process.env.WORKER_POOL_MAX_CONCURRENT || String(Math.min(8, PHYSICAL_CORES)),
  10,
);
const WORKER_POOL_BACKLOG_THRESHOLD = parseInt(process.env.WORKER_POOL_BACKLOG_THRESHOLD || '2', 10);
const WORKER_POOL_BACKLOG_WINDOW_MS = parseInt(process.env.WORKER_POOL_BACKLOG_WINDOW_MS || '2000', 10);

const CALLBACK_TIMEOUT = parseInt(process.env.CALLBACK_TIMEOUT || '10000', 10);

// 永久失败负缓存 TTL（#465 定案）：known-bad 条目超过 TTL 后自动失效（内容可能已被修复/
// 引擎升级后可转，避免"毒化"永久失败）。默认 24h；设 0 = 永久不失效（须管理员手动 reset）。
const NEGATIVE_CACHE_TTL_HOURS = parseFloat(process.env.NEGATIVE_CACHE_TTL_HOURS || '24');

export interface PriorityConfig {
  label: string;
  maxConcurrent: number;
  timeout: number;
  acquireTimeout: number;
}

export {
  PORT,
  PROJECT_ROOT,
  PRIORITY_CONFIG,
  MXCAD_CONFIG,
  QUEUE_DRIVER,
  REDIS_URL,
  CONVERSION_SERVICE_SECRET,
  INTERNAL_SERVICE_SECRET,
  CONVERSION_SERVICE_REQUIRE_AUTH,
  WORKER_POOL_AUTO_SCALE,
  WORKER_POOL_MAX_MULTIPLIER,
  WORKER_POOL_MAX_CONCURRENT,
  WORKER_POOL_BACKLOG_THRESHOLD,
  WORKER_POOL_BACKLOG_WINDOW_MS,
  CALLBACK_TIMEOUT,
  NEGATIVE_CACHE_TTL_HOURS,
};
