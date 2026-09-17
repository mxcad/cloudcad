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
