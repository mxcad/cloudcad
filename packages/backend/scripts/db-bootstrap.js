'use strict';

/**
 * 源码启动 DB 引导（`pnpm dev` 的 predev 钩子）
 *
 * 部署 runtime（runtime/scripts/commands/migrate.js）已自动化「建库 → 迁移 → 种子」
 * 全链路，但源码启动（git clone → pnpm i → pnpm dev）没有等价步骤：PG 数据目录
 * 全新时后端直接崩在 `database "cloudcad" does not exist`。本脚本补齐该缺口，
 * 复用 runtime 的单一事实源（勿在此重写 psql 调用/等待逻辑）：
 *   - waitForDatabase            runtime/scripts/lib/health.js
 *   - getDbEnv/checkDatabaseExists
 *                                runtime/scripts/commands/db-backup.js
 *   - createDatabase             runtime/scripts/commands/migrate.js
 *   - runPnpm                    runtime/scripts/lib/proc.js
 *
 * 幂等语义（任何一步失败都只告警、恒 exit 0，绝不阻塞 pnpm dev）：
 *   - PG 未启动/不可达        → 告警退出（后端启动时会给出清晰报错）
 *   - 主库不存在              → CREATE DATABASE（含 shadow 库，供 prisma migrate dev）
 *   - 库存在（或本次新建）    → prisma migrate deploy（全已应用时为快速 no-op，
 *                               兼作 schema 自愈；必须用 `exec` 形式——backend 包
 *                               没有名为 prisma 的 script，`pnpm -F backend prisma …`
 *                               会静默 no-op 且 exit 0）
 *   - users 表为空（0 行）    → db:seed（角色/权限/config registry/VIP 档位；
 *                               种子幂等，覆盖「库新建」与「上次建库后种子中断」
 *                               两种未初始化态；已有用户的系统跳过，不碰存量数据）
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_SCRIPTS = path.join(PROJECT_ROOT, 'runtime', 'scripts');

const { log } = require(path.join(RUNTIME_SCRIPTS, 'lib', 'logger.js'));
const { waitForDatabase } = require(path.join(RUNTIME_SCRIPTS, 'lib', 'health.js'));
const { runPnpm } = require(path.join(RUNTIME_SCRIPTS, 'lib', 'proc.js'));
const {
  getDbEnv,
  checkDatabaseExists,
  countUsers,
} = require(path.join(RUNTIME_SCRIPTS, 'commands', 'db-backup.js'));
const { createDatabase } = require(
  path.join(RUNTIME_SCRIPTS, 'commands', 'migrate.js')
);

async function main() {
  // DB 连接参数取自 packages/backend/.env（getDbEnv 已按部署形态解析 env 路径）
  const { config } = getDbEnv();
  const host = config.DB_HOST || 'localhost';
  const port = Number(config.DB_PORT || 5432);
  const user = config.DB_USERNAME || 'postgres';
  const dbName = config.DB_DATABASE || 'cloudcad';

  // 1. 等 PG 就绪（短超时：PG 没起时不长时间卡住 dev）
  try {
    await waitForDatabase(port, 'PostgreSQL', 15000, host);
  } catch {
    log(
      'yellow',
      `⚠️  PostgreSQL 未就绪（${host}:${port}），跳过 DB 引导；后端启动时会给出清晰报错`
    );
    return;
  }

  // 2. 主库存在性（null = 实例未就绪，不可当 false）
  const exists = await checkDatabaseExists(host, port, user, dbName);
  if (exists === null) {
    log('yellow', '⚠️  无法判定数据库状态（实例未就绪），跳过 DB 引导');
    return;
  }

  if (!exists) {
    log('cyan', `数据库 ${dbName} 不存在，自动创建（含 shadow 库）...`);
    const mainOk = await createDatabase(host, port, user, dbName);
    const shadow = `${dbName}_shadow`;
    // null = 无法判定（实例未就绪）：按「可能已存在」处理，不强行建库
    const shadowExists = await checkDatabaseExists(host, port, user, shadow);
    const shadowOk =
      shadowExists !== false
        ? true
        : await createDatabase(host, port, user, shadow);
    if (!mainOk || !shadowOk) {
      log(
        'yellow',
        '⚠️  数据库创建失败，跳过后续步骤；后端启动时会给出清晰报错'
      );
      return;
    }
  }

  // 3. 迁移（幂等：全部已应用时 migrate deploy 为快速 no-op，兼作 schema 自愈）
  log('cyan', '应用数据库迁移（prisma migrate deploy）...');
  if (
    !runPnpm(['--filter', 'backend', 'exec', 'prisma', 'migrate', 'deploy'])
  ) {
    log('yellow', '⚠️  prisma migrate deploy 失败，跳过后续步骤');
    return;
  }

  // 4. 种子：users 为空时执行（幂等；覆盖新建库与上次种子中断的半初始化态）
  const userCount = await countUsers(host, port, user, dbName);
  if (userCount === 0) {
    log('cyan', '初始化种子数据（角色/权限/config registry/VIP 档位）...');
    if (!runPnpm(['--filter', 'backend', 'run', 'db:seed'])) {
      log('yellow', '⚠️  db:seed 失败，请手动执行：pnpm --filter backend db:seed');
    }
  } else if (userCount === null) {
    log('yellow', '⚠️  无法统计 users 行数，跳过种子步骤');
  }

  log('green', '✓ DB 引导完成');
}

main().catch((err) => {
  // 绝不阻塞 pnpm dev：意外异常只告警
  log('yellow', `⚠️  DB 引导跳过：${err && err.message ? err.message : err}`);
});
