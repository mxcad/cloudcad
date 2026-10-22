// 预加载 .env / .env.local 进 process.env（0 外部依赖，自写最小解析器——本服务刻意不引 dotenv）。
// 必须在 constants.ts 求值（读 process.env.REDIS_URL / QUEUE_DRIVER / CONVERSION_SERVICE_PORT 等）
// 之前完成：constants.ts 顶部 import './env'，ES 模块按序求值，env 先于 constants 体执行。
// 已存在的 process.env 优先（真实环境变量覆盖 .env 文件，便于部署时用系统 env 注入）。
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// 候选路径：cwd（pnpm --filter dev 的 cwd 即包目录）+ 编译产物 dist/lib 上两级 + 源码 lib 上一级。
// 编译后 __dirname 落在 dist/lib/，故包目录须上两级；源码态（tsx 直跑）则上一级。
const candidatePaths = [
  join(process.cwd(), '.env.local'),
  join(process.cwd(), '.env'),
  join(__dirname, '..', '..', '.env.local'),
  join(__dirname, '..', '..', '.env'),
  join(__dirname, '..', '.env.local'),
  join(__dirname, '..', '.env'),
];

// 最小 .env 解析：逐行 KEY=VALUE，忽略空行与 # 注释，剥离成对引号。
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

for (const envFilePath of candidatePaths) {
  if (!existsSync(envFilePath)) continue;
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envFilePath, 'utf8')))) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Redis 模式配置校验（fail-fast）：QUEUE_DRIVER=redis 时 REDIS_URL 必须是真实连接串。
// 两种残缺形态都会让 TaskStore 静默回退内存模式（队列不持久化、重启丢存量任务），
// 错误全程不可见——正是「REDIS_URL 指向不存在端口却无人发现」那类事故的入口：
//   1. 未设置：task-store 曾硬编码兜底 redis://127.0.0.1:6379/0，目标机常无此实例；
//   2. 占位符：.env.example 曾写成 redis://:your-redis-password@... ，复制后忘改。
// 部署形态不受影响：start.js / docker-runtime / verify-deploy 三条启动路径都从后端
// .env 的 REDIS_* 现场拼串注入 process.env，此处读到的已是真实值（本服务刻意不引
// dotenv，真实 env 优先于 .env 文件，见上方加载循环）。
// 用 console.error 而非 logger：本模块早于 logger 求值，且启动失败信息不应受日志
// 级别/落盘策略影响。
const PLACEHOLDER_RE = /your-|<[^>]*>|placeholder|changeme/i;
if (process.env.QUEUE_DRIVER?.toLowerCase() === 'redis') {
  const redisUrl = (process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) {
    console.error(
      '[env] QUEUE_DRIVER=redis 但 REDIS_URL 未设置。\n' +
        '      不设 REDIS_URL 会静默回退内存模式（队列不持久化、重启丢存量任务）。\n' +
        '      请配置真实连接串（须与 backend .env 的 REDIS_HOST/PORT/PASSWORD/DB 一致），' +
        '或把 QUEUE_DRIVER 改回 local。'
    );
    process.exit(1);
  }
  if (PLACEHOLDER_RE.test(redisUrl)) {
    console.error(
      `[env] REDIS_URL 仍是占位符值 (${redisUrl})，但 QUEUE_DRIVER=redis。\n` +
        '      该地址必然连不上，队列驱动将静默回退内存模式（不持久化、重启丢存量任务）。\n' +
        '      请改为真实连接串（须与 backend .env 的 REDIS_HOST/PORT/PASSWORD/DB 一致），' +
        '或把 QUEUE_DRIVER 改回 local。'
    );
    process.exit(1);
  }
}
