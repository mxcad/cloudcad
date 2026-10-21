/**
 * @fileoverview 数据库迁移命令域
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - createDatabase / hasPendingMigrations / repairMigrationRecords
 *   preflightMigrationCheck / getDatabaseSize
 *   runDatabaseMigration / runDatabaseSeed
 *
 * 依赖方向：commands → lib + commands/db-backup。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const {
  IS_WINDOWS,
  PROJECT_ROOT,
  NODE_EXE,
  PNPM_JS,
  USE_RUNTIME,
} = require('../lib/context');
const { log } = require('../lib/logger');
const { runPnpm, runCommandWithProgress } = require('../lib/proc');
const { findSchemaEngine } = require('../lib/schema-engine');
const { promptConfirm } = require('../lib/prompt');
const { waitForDatabase } = require('../lib/health');
const {
  backupDatabase,
  checkDatabaseExists,
  getDbEnv,
  getPsqlPath,
} = require('./db-backup');
const { checkPrismaClientExists } = require('../setup-offline');

// ==================== 迁移错误串判定（纯函数，可单测） ====================
// Prisma/PG 错误码 →「可安全继续」的语义判定集中于此，消灭散在各 async 函数里的内联
// 字符串匹配（架构审查 ⑨）：错误码一旦变动，单测红灯而非部署时静默误判。

/** P3018 = migration 已被 rolled back（幂等：再次 resolve --rolled-back 视为成功） */
function isAlreadyRolledBackError(stderr) {
  return typeof stderr === 'string' && stderr.includes('P3018');
}

/** P3008 = migration 已被记录为 applied（幂等：再次 resolve --applied 可安全继续） */
function isAlreadyAppliedError(stderr) {
  return typeof stderr === 'string' && stderr.includes('P3008');
}

/** 变更已存在于数据库（表/索引/约束/对象已存在）→ 可标记 applied 继续 */
function isAlreadyExistsError(output) {
  return typeof output === 'string' && /already exists|42P07|42710|42701|42P16/.test(output);
}

/** enum 值已不合法（enum 已被提前迁移，数据已转换）→ 可标记 applied 继续 */
function isEnumValueRemovedError(output) {
  return (
    typeof output === 'string' &&
    /22P02/.test(output) &&
    /invalid input value for enum/.test(output)
  );
}

/** migration.sql 是否含零停机索引创建（CREATE INDEX CONCURRENTLY） */
function hasConcurrentIndexCreation(sql) {
  return typeof sql === 'string' && sql.includes('CREATE INDEX CONCURRENTLY');
}

/**
 * 构建执行 prisma/pnpm 命令的 env，注入离线 node 目录到 PATH。
 *
 * 离线部署包（USE_RUNTIME）中 node 未安装到系统 PATH，仅存在于
 * runtime/<platform>/node/node.exe。pnpm exec 内部经 cmd 调用
 * node_modules/.bin/*.cmd（如 prisma.cmd）时依赖 PATH 中的 `node`，
 * 不注入会报 "'node' 不是内部或外部命令"（实例：migrate deploy）。
 */
function buildPnpmEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!USE_RUNTIME) return env;
  const nodeDir = path.dirname(NODE_EXE);
  const existingPath = env.PATH || '';
  const parts = existingPath.split(path.delimiter).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === nodeDir.toLowerCase())) {
    parts.unshift(nodeDir);
  }
  const nextEnv = { ...env, PATH: parts.join(path.delimiter) };
  // Prisma schema-engine 预置二进制（离线 migrate deploy 用，见 lib/schema-engine）
  const schemaEnginePath = findSchemaEngine();
  if (schemaEnginePath) {
    nextEnv.PRISMA_SCHEMA_ENGINE_BINARY = schemaEnginePath;
  }
  return nextEnv;
}

/**
 * 判断 pnpm 命令应使用的可执行文件：离线时用完整 node.exe + pnpm.cjs，
 * 否则回退到 PATH 中的 `pnpm`。
 */
function prismaCommandArgs() {
  return PNPM_JS && fs.existsSync(PNPM_JS)
    ? { cmd: NODE_EXE, args: [PNPM_JS] }
    : { cmd: 'pnpm', args: [] };
}

/**
 * 创建数据库（如果不存在）
 */
async function createDatabase(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    log('red', `[错误] psql 不存在: ${psqlPath}`);
    return false;
  }

  const { env } = getDbEnv();

  log('cyan', `正在创建数据库: ${database} ...`);

  // 使用 shell 方式执行命令
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d postgres -c "CREATE DATABASE ${database}"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const errorMsg = result.stderr || result.stdout || '未知错误';
    log('red', `[错误] 数据库创建失败: ${errorMsg}`);
    return false;
  }

  return true;
}

/**
 * 检查是否有待应用的迁移
 * @returns {Promise<boolean>} - 是否有 pending migrations
 */
async function hasPendingMigrations() {
  try {
    const isWin = IS_WINDOWS;
    const pnpmCmd =
      PNPM_JS && fs.existsSync(PNPM_JS) ? `"${NODE_EXE}" "${PNPM_JS}"` : 'pnpm';

    // 必须用 `exec` 形式：backend 包没有名为 `prisma` 的 script，
    // `pnpm -F backend prisma …` 会被 pnpm 静默丢弃、**exit 0 且什么都没执行**。
    // 后果是本函数误判「无待应用迁移」（返回 false）→ 跳过迁移前备份。
    //
    // 实测（pnpm 9.15.9）输出是 `No projects matched the filters "…"`；
    // 注意这行警告**正确的 `exec` 形式首行也会打**（exec 之后 prisma 照常运行），
    // 别看到它就去「修」，也别拿它当失败判据——成败只看 exit code。
    const cmd = `${pnpmCmd} --filter backend exec prisma migrate status`;
    const result = spawnSync(cmd, [], {
      cwd: PROJECT_ROOT,
      shell: isWin,
      stdio: 'pipe',
      encoding: 'utf-8',
      env: buildPnpmEnv(),
    });

    if (result.status === 0) {
      return false;
    }

    const output = result.stdout || result.stderr || '';
    const pendingMatch = output.match(
      /(\d+)\s*migrations?\s*have not yet been applied/i
    );
    if (pendingMatch) {
      const count = parseInt(pendingMatch[1], 10);
      return count > 0;
    }

    return true;
  } catch {
    return true;
  }
}


// reconcileMigrations 已删除。migrate deploy 自身能处理所有情况，
// 下方的重试逻辑可处理 db push 导致的 "对象已存在" 错误。
//
// fixMigrationStatus 也已删除（曾在本文件，无消费者）。删除理由：
// 1. 裸 `pnpm -F backend prisma …` 静默 no-op 且 exit 0 → 恒报「迁移状态正常」，
//    即它没读到任何状态就宣布正常（见 hasPendingMigrations 内的同型注释）；
// 2. 唯一能走到修复分支的前置 execSync 遇到非零退出即 throw，
//    而「状态异常」恰恰是唯一返回非零的场景 → 自修复路径必然崩溃；
// 3. 其正则与 Prisma 真实输出不符，`(\d+)` 还会把 `20261020120000_xxx`
//    截断成 `20261020120000`，resolve 时必然找不到迁移名；
// 4. 职责已由 repairMigrationRecords()（直查 _prisma_migrations +
//    information_schema）与下方 migrate deploy 的重试/resolve 循环取代。
// 勿以「补上缺失功能」为由原样恢复；要真修得先造异常迁移状态实测正则。

/**
 * 修复 reconcileMigrations() 历史 bug 遗留的错误记录（通用方案）
 *
 * 问题：旧的 reconcileMigrations() 在 migrate diff 超时/失败时，
 * 错误地将 pending migration 标记为 applied 但不执行。
 *
 * 修复：对比 `_prisma_migrations` 中每条记录的 migration.sql，
 * 提取 `ADD COLUMN` 语句，检查 `information_schema.columns` 确认列是否存在。
 * 从最新 → 最旧遍历，找到第一个缺少列的 migration → 将其及之后全部标记 rolled-back。
 *
 * 不依赖硬编码 migration 名，自动适配任何 schema 版本。
 */
async function repairMigrationRecords() {
  const { env, config: envConfig } = getDbEnv();
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    log('cyan', '  [修复] psql 不可用，跳过');
    return;
  }

  log('cyan', '  [修复] 检查历史 migration 记录...');

  const runPsql = (sql) => spawnSync(`"${psqlPath}" -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" -tAc "${sql}"`, [], {
    env, shell: true, stdio: 'pipe', encoding: 'utf-8',
  });

  // 1. 读取 _prisma_migrations 中所有标记为已应用的 migration（按时间正序）
  // 注意：Prisma v5+ 移除了 success 列，用 finished_at IS NOT NULL 替代
  const migResult = runPsql(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at"
  );
  const appliedMigs = (migResult.stdout || '').trim().split('\n').filter(Boolean);
  if (appliedMigs.length === 0) {
    const err = (migResult.stderr || '').trim();
    if (err) log('yellow', `  [修复] psql 查询失败: ${err.slice(0, 200)}`);
    else log('cyan', '  [修复] _prisma_migrations 无记录，跳过');
    return;
  }

  // 2. 读取数据库中真实列名
  const colsResult = runPsql(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'file_system_nodes' ORDER BY ordinal_position"
  );
  const realCols = new Set((colsResult.stdout || '').trim().split('\n').filter(Boolean));

  // 3. 从最新 → 最旧遍历，找到第一条缺少 ADD COLUMN 的 migration
  const migrationsDir = path.join(PROJECT_ROOT, 'packages', 'backend', 'prisma', 'migrations');
  let cutoffIndex = -1;

  for (let i = appliedMigs.length - 1; i >= 0; i--) {
    const name = appliedMigs[i];
    const sqlPath = path.join(migrationsDir, name, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, 'utf-8');
    const addColRegex = /ALTER TABLE\s+"file_system_nodes"\s+ADD COLUMN\s+"(\w+)"/g;
    let match;
    let hasMissing = false;
    while ((match = addColRegex.exec(sql)) !== null) {
      if (!realCols.has(match[1])) {
        hasMissing = true;
        break;
      }
    }
    if (hasMissing) {
      cutoffIndex = i;
      break;
    }
  }

  if (cutoffIndex === -1) {
    log('green', '  [修复] 所有 migration 列均存在，无问题');
    return;
  }

  // 4. 将从 cutoff 开始的所有 migration 标记为 rolled-back
  const toRollback = appliedMigs.slice(cutoffIndex);
  log('yellow', `  检测到 ${toRollback.length} 个被错误标记的 migration (${toRollback[0]} ~ ${toRollback[toRollback.length - 1]})`);

  const prismaExec = [...prismaCommandArgs().args, '-F', 'backend', 'exec', 'prisma'];

  for (const name of toRollback) {
    const r = spawnSync(
      prismaCommandArgs().cmd,
      [...prismaExec, 'migrate', 'resolve', '--rolled-back', name],
      {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: IS_WINDOWS,
        encoding: 'utf-8',
        env: buildPnpmEnv(),
      }
    );
    if (r.status === 0) {
      log('green', `    ✓ ${name}`);
    } else {
      const err = (r.stderr || '').trim();
      if (isAlreadyRolledBackError(err)) {
        log('green', `    ✓ ${name} (already rolled back)`);
      } else {
        log('red', `    ✗ ${name}: ${err}`);
      }
    }
  }
}

/**
 * 迁移前预检
 * 检查是否有破坏性变更、数据库大小等
 */
async function preflightMigrationCheck() {
  log('cyan', '执行迁移前检查...');
  console.log('');

  // 1. 检查数据库大小
  try {
    const { config: envConfig } = getDbEnv();
    const dbHost = envConfig.DB_HOST || 'localhost';
    const dbPort = envConfig.DB_PORT || '5432';
    const dbUser = envConfig.DB_USERNAME || 'postgres';
    const dbName = envConfig.DB_DATABASE || 'cloudcad';

    const dbSize = await getDatabaseSize(dbHost, dbPort, dbUser, dbName);
    const dbSizeGB = (dbSize / (1024 * 1024 * 1024)).toFixed(2);

    log('cyan', `  数据库大小: ${dbSizeGB} GB`);

    if (dbSize > 10 * 1024 * 1024 * 1024) {
      // 10GB
      log('yellow', '  ⚠️  数据库较大，索引创建可能需要几分钟');
      log('yellow', '  提示：使用 CONCURRENTLY 模式，不会阻塞读写操作');
      console.log('');
    }
  } catch (err) {
    log('yellow', '  ⚠️  无法获取数据库大小，继续执行');
    console.log('');
  }

  // 3. 检查是否有 CONCURRENTLY 索引创建
  try {
    const migrationsDir = path.join(
      PROJECT_ROOT,
      'packages',
      'backend',
      'prisma',
      'migrations'
    );

    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let hasConcurrentIndex = false;
      for (const migration of migrationFiles) {
        const sqlFile = path.join(migrationsDir, migration, 'migration.sql');
        if (fs.existsSync(sqlFile)) {
          const sqlContent = fs.readFileSync(sqlFile, 'utf8');
          if (hasConcurrentIndexCreation(sqlContent)) {
            hasConcurrentIndex = true;
            break;
          }
        }
      }

      if (hasConcurrentIndex) {
        log('green', '  ✓ 检测到 CONCURRENTLY 索引创建（零停机）');
        console.log('');
      }
    }
  } catch (err) {
    // 忽略检查错误
  }

  return true;
}

/**
 * 获取数据库大小（字节）
 */
async function getDatabaseSize(host, port, user, dbName) {
  const { execSync } = require('child_process');

  try {
    // 使用 psql 查询数据库大小
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -t -c "SELECT pg_database_size('${dbName}');"`;

    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // 口令必须从 .env 取（调用方已按 .env 解析 host/port/user/db）：
      // 部署机 shell 里没有 DB_PASSWORD，读 process.env 会静默连不上、恒报 0 字节
      env: { ...process.env, PGPASSWORD: getDbEnv().env.PGPASSWORD },
    });

    const size = parseInt(result.trim(), 10);
    return isNaN(size) ? 0 : size;
  } catch (err) {
    return 0;
  }
}

// options 非空 = 非交互调用（运维中心 ADR-0071）：迁移前备份失败时不再询问，
// 一律中止（安全默认）。缺省 null 保持原交互行为。
async function runDatabaseMigration(options = null) {
  log('blue', '[2/3] 执行数据库迁移...');

  // 检查 .env 文件是否存在
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    log('red', '[错误] packages/backend/.env 文件不存在');
    log('cyan', '请先配置数据库连接信息');
    return false;
  }

  // 检查 Prisma Client 是否已存在（部署包预生成）
  const prismaReady = checkPrismaClientExists();

  if (prismaReady) {
    log('cyan', '[跳过] Prisma Client 已就绪（来自部署包）');
  } else {
    // 生成 Prisma Client（离线模式，使用预下载的引擎）
    log('cyan', '生成 Prisma Client...');
    if (!runPnpm(['--filter', 'backend', 'db:generate'])) {
      log('red', '[错误] Prisma Client 生成失败');
      return false;
    }
  }

  // 检查数据库是否存在
  const { config: envConfig } = getDbEnv();
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  // 确认实例已接受查询再碰 pg_database：TCP 端口通连不算就绪——WAL 重放期间
  // PG 会 accept 连接后立刻回 `FATAL: the database system is starting up`，
  // 此时建库必然失败。这是建库前唯一的正确闸门。
  try {
    await waitForDatabase(dbPort, 'PostgreSQL', 60000, dbHost);
  } catch (err) {
    log('red', `[错误] 数据库未就绪，无法创建数据库: ${err.message}`);
    return false;
  }

  let dbExists = await checkDatabaseExists(dbHost, dbPort, dbUser, dbName);
  if (dbExists === null) {
    log(
      'red',
      '[错误] 无法确认数据库状态（实例未就绪或不可达），请检查数据库服务'
    );
    return false;
  }

  if (!dbExists) {
    log('yellow', '⚠️  数据库不存在，正在创建数据库...');
    if (!(await createDatabase(dbHost, dbPort, dbUser, dbName))) {
      log('red', '[错误] 数据库创建失败，请手动创建数据库');
      return false;
    }
    log('green', '[✓] 数据库创建成功');
    dbExists = true;
  }

  // 检查是否有待应用的迁移，只有存在时才备份
  const hasPending = await hasPendingMigrations();
  if (hasPending && dbExists) {
    log('blue', '📦 检测到待应用迁移，正在备份数据库...');
    
    // 执行迁移前预检
    await preflightMigrationCheck();
    
    const backupSuccess = await backupDatabase();

    if (!backupSuccess) {
      log('yellow', '⚠️  数据库备份失败！');
      log('yellow', '如果继续部署，迁移失败时将无法恢复数据。');
      console.log('');

      if (options) {
        // 非交互（运维中心）：备份失败一律中止，请先解决备份问题再迁移
        log('yellow', '非交互模式：备份失败，已中止迁移。');
        return false;
      }

      const confirmed = await promptConfirm('是否继续部署？(yes/no): ');
      if (!confirmed) {
        log('yellow', '已取消部署');
        return false;
      }
    }
  } else {
    log('cyan', '[跳过] 无待应用迁移，无需备份数据库');
  }

  // 检测被 reconcileMigrations() 历史 bug 错误标记的 migration
  //（对比 migration.sql 中 ADD COLUMN 与 information_schema 真实列）
  await repairMigrationRecords();

  // === 始终使用 migrate deploy（推荐方式）===
  // migrate deploy 会自动处理空数据库和已有数据库的情况
  // 当迁移因"对象已存在"失败时，自动标记为 applied 并重试，兼容 db push 导致的 schema drift
  log('cyan', '正在应用数据库迁移 (migrate deploy)...');
  log('cyan', `数据库: ${dbName}`);
  console.log('');

  const MAX_MIGRATE_RETRIES = 10;
  let migrateAttempt = 0;
  let migrationSuccess = false;
  let elapsed;

  while (migrateAttempt < MAX_MIGRATE_RETRIES && !migrationSuccess) {
    migrateAttempt++;

    if (migrateAttempt > 1) {
      console.log('');
      log('cyan', `┌─ 重试部署 (第 ${migrateAttempt} 次) ─────────────────┐`);
    }

    const startTime = Date.now();
    log('blue', '┌─ 迁移进度 ──────────────────────────────────┐');
    log('blue', '│  开始执行数据库迁移...                      │');
    log('blue', '└─────────────────────────────────────────────┘');
    console.log('');

    // 使用 -F (filter) + exec 来正确执行 prisma 命令
    const migrationResult = await runCommandWithProgress(
      prismaCommandArgs().cmd,
      [...prismaCommandArgs().args, '-F', 'backend', 'exec', 'prisma', 'migrate', 'deploy'],
      { silent: false, env: buildPnpmEnv({ PGOPTIONS: '-c jit=off' }) }
    );

    elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (migrationResult.success) {
      migrationSuccess = true;
      break;
    }

    // 迁移失败处理
    log('blue', '┌─ 迁移结果 ──────────────────────────────────┐');
    log('red', `│  ❌ 迁移失败 (耗时: ${elapsed}s)                   │`);
    log('blue', '└─────────────────────────────────────────────┘');
    console.log('');
    log('red', '[错误] 数据库迁移失败，检查错误类型...');
    console.log('');

    const errorOutput = migrationResult.stderr || migrationResult.stdout || '';

    // 匹配 "Migration name: 20260414100000_sync_enum_changes" 格式
    const migrationMatch = errorOutput.match(/Migration name:\s*([^\s\n]+)/);
    // 或者匹配 "The `20260414100000_sync_enum_changes` migration started at" 格式
    const altMigrationMatch = errorOutput.match(/The `([^`]+)` migration started at/);

    const failedMigrationName = migrationMatch?.[1] || altMigrationMatch?.[1];

    if (!failedMigrationName) {
      // P1000 = 数据库认证/连接失败：错误输出里根本没有迁移名，给"migrate
      // resolve"指引是误导（用户 VM 实锤：DB_PORT 与 DATABASE_URL 漂移，
      // Prisma 连到旧端口的系统库，此分支曾把用户引向不存在的迁移名操作）
      if (/P1000|Authentication failed/i.test(errorOutput)) {
        log('red', '[错误] 数据库认证失败 (P1000)：.env 的数据库凭据与服务端不匹配，或 DB_PORT 与 DATABASE_URL 指向了不同的库（如系统数据库）。');
        log('cyan', '  请确认 DB_PORT 与 DATABASE_URL 指向同一数据库（端口一致，且是本部署的 PostgreSQL），且 DB_PASSWORD 与 DATABASE_URL 中的密码一致，修正后重跑。');
      } else {
        log('yellow', '⚠️  无法解析失败迁移名称，请手动执行:');
        log('cyan', '  npx prisma migrate resolve --rolled-back <migration_name>');
        log('cyan', '  或 npx prisma migrate resolve --applied <migration_name>');
      }
      break;
    }

    // 判断是否为"已存在"类错误（表、索引、约束等在数据库中已存在）
    // 42P07 = relation already exists, 42710 = duplicate object, 42P16 = invalid table definition
    // 22P02 = enum 值已不合法（通常 enum 已被提前迁移，数据也已转换），标记为 applied 安全
    const alreadyExists = isAlreadyExistsError(errorOutput);
    const enumValueRemoved = isEnumValueRemovedError(errorOutput);

    if (alreadyExists || enumValueRemoved) {
      if (alreadyExists) {
        log('yellow', `检测到迁移 "${failedMigrationName}" 失败：变更已存在于数据库`);
      } else {
        log('yellow', `检测到迁移 "${failedMigrationName}" 失败：枚举值已不存在（enum 已提前迁移）`);
      }
      log('cyan', '自动标记为已应用（applied）并继续部署...');

      const resolveResult = spawnSync(
        prismaCommandArgs().cmd,
        [...prismaCommandArgs().args, '-F', 'backend', 'exec', 'prisma', 'migrate', 'resolve', '--applied', failedMigrationName],
        {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          shell: IS_WINDOWS,
          encoding: 'utf-8',
          env: buildPnpmEnv(),
        }
      );

      if (resolveResult.status === 0) {
        log('green', `[✓] 迁移 "${failedMigrationName}" 已标记为 applied`);
      } else {
        const resolveErr = (resolveResult.stderr || '').trim();
        log('red', `[错误] 标记 applied 失败: ${resolveErr || '未知错误'}`);
        // P3008 = already recorded as applied（已被其他进程标记过，可安全继续）
        if (!isAlreadyAppliedError(resolveErr)) {
          break;
        }
        log('yellow', '（P3008 表示已标记过，继续部署）');
      }

      if (migrateAttempt >= MAX_MIGRATE_RETRIES) {
        log('red', `[错误] 已达到最大重试次数 (${MAX_MIGRATE_RETRIES})，终止部署`);
      }
    } else {
      // 非"已存在"类错误 → 回退到 rolled-back 并停止部署
      log('red', `检测到迁移 "${failedMigrationName}" 失败：非兼容性错误`);
      log('cyan', '正在自动标记为 rolled-back...');

      const resolveResult = spawnSync(
        prismaCommandArgs().cmd,
        [...prismaCommandArgs().args, '-F', 'backend', 'exec', 'prisma', 'migrate', 'resolve', '--rolled-back', failedMigrationName],
        {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          shell: IS_WINDOWS,
          encoding: 'utf-8',
          env: buildPnpmEnv(),
        }
      );

      if (resolveResult.status === 0) {
        log('green', '[✓] 失败迁移已标记为 rolled-back');
        log('cyan', '提示：请检查迁移脚本后重新运行部署');
      } else {
        log('red', `[错误] 标记失败: ${resolveResult.stderr || '未知错误'}`);
      }
      break;
    }
  }

  if (!migrationSuccess) {
    log('blue', '┌─ 最终结果 ──────────────────────────────────┐');
    log('red', '│  ❌ 数据库迁移失败                           │');
    log('blue', '└─────────────────────────────────────────────┘');
    log('red', '[错误] 数据库迁移失败，请检查上方日志');
    return false;
  }

  log('blue', '┌─ 迁移结果 ──────────────────────────────────┐');
  log('green', `│  ✅ 迁移成功 (耗时: ${elapsed}s)                   │`);
  log('blue', '└─────────────────────────────────────────────┘');
  console.log('');
  log('green', '[✓] 数据库迁移完成');

  // 重新生成 Prisma Client，确保与当前数据库 schema 一致
  log('cyan', '重新生成 Prisma Client...');
  const generateResult = spawnSync(
    prismaCommandArgs().cmd,
    [...prismaCommandArgs().args, '-F', 'backend', 'exec', 'prisma', 'generate'],
    {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: IS_WINDOWS,
      encoding: 'utf-8',
      env: buildPnpmEnv(),
    }
  );
  if (generateResult.status === 0) {
    log('green', '[✓] Prisma Client 已更新');
  } else {
    log('yellow', '⚠️  Prisma Client 生成失败，请手动运行: npx prisma generate');
  }

  return true;
}

async function runDatabaseSeed() {
  log('blue', '执行种子数据...');

  if (!runPnpm(['--filter', 'backend', 'db:seed'])) {
    log('red', '[错误] 种子数据执行失败');
    return false;
  }

  log('green', '[✓] 种子数据完成');
  return true;
}

/**
 * PII 字段级加密存量回填（#417 等保 8.1.4.8）。
 *
 * migration 应用后、读切换代码启动前执行：用当前 .env 密钥把 users 表
 * phone/email 的派生列（enc/hmac）回填。脚本幂等——已回填时秒跳过
 * （count=0），升级部署无额外开销。
 *
 * 失败即返回 false 阻塞部署：读切换代码查 HMAC 列，若存量行 HMAC 列缺失，
 * 存量用户登录/查重会落空，故回填失败不应让部署继续（降级提示手动执行）。
 */
async function runPiiBackfill() {
  log('blue', 'PII 字段级加密存量回填（phone/email → enc/hmac）...');
  // 脚本是 .js（非 .ts）：离线部署只装生产依赖（devDependencies 含 tsx 不装），
  // 离线 runtime Node 20 不能原生跑 TS。故用 node 直接跑 .js 脚本——node 恒可用。
  // 脚本 require dist/ 编译产物（pii-crypto.service.js），部署包自带 dist/。
  // 传绝对路径（runCommandWithProgress 以仓库根为 cwd，相对路径会错位）。
  const scriptPath = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    'scripts',
    'pii-backfill.js'
  );
  const result = await runCommandWithProgress(NODE_EXE, [scriptPath], {
    silent: false,
    env: buildPnpmEnv(),
  });
  if (result.success) {
    log('green', '[✓] PII 回填完成（已回填则自动跳过）');
    return true;
  }
  const err = (result.stderr || result.stdout || '').trim();
  log('red', '[错误] PII 回填失败' + (err ? `: ${err.slice(0, 300)}` : ''));
  log('cyan', '请手动执行: node packages/backend/scripts/pii-backfill.js');
  return false;
}

module.exports = {
  createDatabase,
  hasPendingMigrations,
  repairMigrationRecords,
  preflightMigrationCheck,
  getDatabaseSize,
  runDatabaseMigration,
  runDatabaseSeed,
  runPiiBackfill,
  // 迁移错误串判定纯函数（架构审查 ⑨：集中错误码语义，可单测）
  isAlreadyRolledBackError,
  isAlreadyAppliedError,
  isAlreadyExistsError,
  isEnumValueRemovedError,
  hasConcurrentIndexCreation,
};
