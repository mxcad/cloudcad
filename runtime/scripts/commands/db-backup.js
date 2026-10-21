/**
 * @fileoverview 数据库备份 / 恢复 / 清理 命令域
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - listBackupFiles / formatSize / getPgDumpPath / getPsqlPath
 *   getPostgresLibPath / getRuntimeLibPaths / getDbEnv / checkDatabaseExists
 *   isDatabaseEmpty / backupDatabase / listBackups / promptSelectBackup
 *   restoreDatabase / cleanupOldBackups / databaseBackupMenu
 *
 * 依赖方向：commands → lib。被 commands/migrate、commands/start 引用。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const {
  IS_WINDOWS,
  IS_LINUX,
  USE_RUNTIME,
  PROJECT_ROOT,
  PLATFORM_DIR,
  DATA_DIR,
  NODE_EXE,
  PNPM_JS,
  pgLibDir,
  OPS_ENTRY,
} = require('../lib/context');
const { colors, log, clearScreen, printHeader } = require('../lib/logger');
const { parseEnvFile } = require('../lib/env');
const { prompt, promptConfirm } = require('../lib/prompt');
const { formatSize } = require('../lib/format');
const { detectDeployForm } = require('../lib/deploy-form');

/**
 * .env 路径（单一事实源，#442）：裸机形态 = packages/backend/.env；
 * docker 形态 = 部署根 .env（docker 包没有 packages/backend/.env，根 .env 是
 * 容器 env_file 的唯一事实源，由 docker-runtime step2 生成）。
 * @param {string} [rootDir] 部署根（缺省 PROJECT_ROOT；测试可注入临时目录）
 * @returns {string}
 */
function getEnvPath(rootDir = PROJECT_ROOT) {
  if (detectDeployForm(rootDir) === 'docker') {
    return path.join(rootDir, '.env');
  }
  return path.join(rootDir, 'packages', 'backend', '.env');
}

/**
 * Docker 形态 psql 执行上下文（#442）：宿主没有 psql，全部经
 * `docker exec cloudcad-pg psql …` 在容器内执行。裸机形态返回 null
 * （调用方回落宿主 psql 分支）。
 * @param {string} [rootDir] 部署根（缺省 PROJECT_ROOT；测试可注入临时目录）
 * @returns {?{container: string, exec: Function}} exec = docker CLI 执行器
 *   （docker-runtime 的 docker()，已含 rootless 影子 socket env）
 */
function getDockerExec(rootDir = PROJECT_ROOT) {
  if (detectDeployForm(rootDir) !== 'docker') return null;
  const dockerRuntime = require('../../docker-runtime/index');
  dockerRuntime.detectRuntimeMode();
  return {
    container: 'cloudcad-pg',
    exec: (args, timeoutMs) => dockerRuntime.docker(args, timeoutMs),
  };
}

/**
 * 列出所有备份文件
 * @returns {Array<{name: string, path: string, size: number, modified: Date}>}
 */
function listBackupFiles() {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((file) => file.startsWith('db_backup_') && file.endsWith('.sql'))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      const stats = fs.statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified); // 按时间倒序
}


/**
 * 获取 pg_dump 路径
 */
function getPgDumpPath() {
  if (USE_RUNTIME) {
    return IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_dump.exe')
      : path.join(PLATFORM_DIR, 'postgres', 'bin', 'pg_dump');
  }
  return IS_WINDOWS ? 'pg_dump.exe' : 'pg_dump';
}

/**
 * 获取 psql 路径
 */
function getPsqlPath() {
  if (USE_RUNTIME) {
    return IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'psql.exe')
      : path.join(PLATFORM_DIR, 'postgres', 'bin', 'psql');
  }
  return IS_WINDOWS ? 'psql.exe' : 'psql';
}

/**
 * 获取 PostgreSQL lib 路径（Linux）
 */
function getPostgresLibPath() {
  return path.join(PLATFORM_DIR, 'postgres', 'lib');
}

/**
 * 获取所有运行时库路径（PostgreSQL、SVN 等）
 * 用于设置 LD_LIBRARY_PATH
 */
function getRuntimeLibPaths() {
  if (!IS_LINUX || !USE_RUNTIME) return '';

  const paths = [
    pgLibDir(), // 单一事实源见 lib/context.js，勿在此重复拼 postgres/lib
    path.join(PLATFORM_DIR, 'subversion', 'lib'),
    // 如果有其他运行时库，也加到这里
  ].filter(p => fs.existsSync(p));

  return paths.join(':');
}

/**
 * 构建数据库命令的环境变量（.env 路径走 getEnvPath：docker 形态读部署根 .env）
 */
function getDbEnv() {
  const envConfig = parseEnvFile(getEnvPath());

  return {
    env: {
      ...process.env,
      PGPASSWORD: envConfig.DB_PASSWORD || '',
      // psql 的客户端消息默认按 OEM 代码页输出（中文 Windows = CP936/GBK），
      // 而本仓所有 psql 调用都用 encoding:'utf-8' 解码 stdout/stderr → 错误文案
      // 变乱码，只能靠猜。强制 UTF8 让 `FATAL: ...` 这类原文可读。
      PGCLIENTENCODING: 'UTF8',
      ...(IS_LINUX && USE_RUNTIME
        ? {
            LD_LIBRARY_PATH: getRuntimeLibPaths(),
          }
        : {}),
    },
    config: envConfig,
  };
}

/**
 * 检查数据库是否存在。
 * @returns {Promise<boolean|null>} true = 存在；false = 确认不存在；
 *   null = 无法判定（psql 缺失 / 实例未就绪 / 尚不可达）。
 *   null 不可当 false：那会让调用方对未就绪的实例执行 CREATE DATABASE 并必然失败。
 */
async function checkDatabaseExists(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return null;
  }

  const { env } = getDbEnv();

  // 使用 shell 方式确保 stdout 能正确捕获，关键是要正确转义 SQL 中的引号
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${database}'"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  // 命令执行成功，检查输出。
  // 注意：勿写 `result.stdout && …`——库不存在时 stdout 为空串，短路会返回 ''
  // 而非文档契约的 false，`!== false` 式判断会漏判（2026-10-20 db-bootstrap 踩坑）
  if (result.status === 0) {
    return (result.stdout || '').trim() === '1';
  }

  // 命令执行失败，区分处理
  const errorMsg = (result.stderr || result.stdout || '').toLowerCase();

  // 密码错误/认证失败 - 无法确定，假设存在
  if (
    errorMsg.includes('password') ||
    errorMsg.includes('authentication') ||
    errorMsg.includes('invalid password')
  ) {
    log('yellow', '⚠️  数据库认证失败，假设数据库已存在');
    return true;
  }

  // 实例未就绪或尚不可达 ≠ 数据库不存在。WAL 重放期间 PG 会 accept 连接后立刻
  // 回 `FATAL: the database system is starting up`，此时去 CREATE DATABASE 必然失败。
  if (
    errorMsg.includes('starting up') ||
    errorMsg.includes('shutting down') ||
    errorMsg.includes('could not connect') ||
    errorMsg.includes('connection refused') ||
    errorMsg.includes('no response') ||
    errorMsg.includes('timed out')
  ) {
    log('yellow', '⚠️  数据库实例尚未就绪，跳过存在性判定');
    return null;
  }

  // 其他错误（如 psql 参数错误）- 无法确定
  log('yellow', `⚠️  数据库检查失败: ${result.stderr || result.stdout}`);
  return false;
}

/**
 * 检查数据库是否为空（无用户表）
 */
async function isDatabaseEmpty(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return true;
  }

  const { env } = getDbEnv();

  // 检查是否存在 users 表（或其他核心表）来判断数据库是否为空
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d "${database}" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public' LIMIT 1"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  // 如果查询失败或没有结果，认为是空数据库
  if (result.status !== 0) {
    return true;
  }

  const hasUsersTable = result.stdout && result.stdout.trim() === '1';
  return !hasUsersTable;
}

/**
 * 统计 users 行数（系统是否已初始化的权威判据）。
 * @returns {Promise<number|null>} 用户数；null = 无法判定
 *   （psql 缺失 / 实例未就绪 / 认证失败 / users 表不存在）。
 *   调用方须把 null 当「未知」处理，不可当 0（那会让向导对已有账号的库
 *   误判为全新部署，配置一个永不生效的初始管理员密码）。
 */
async function countUsers(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return null;
  }

  const { env } = getDbEnv();
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d "${database}" -tAc "SELECT count(*) FROM users"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return null;
  }

  const n = parseInt((result.stdout || '').trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * 备份数据库
 * @param {Object} options - 选项
 * @param {string} options.backupDir - 备份目录（可选）
 * @param {string} options.filename - 文件名（可选）
 * @param {Object} [deps] - 可注入的 IO 缝（测试用）：dockerExec
 * @returns {Promise<boolean>} - 是否成功
 */
async function backupDatabase(options = {}, deps = {}) {
  log('blue', '📦 正在备份数据库...');

  const backupDir = options.backupDir || path.join(DATA_DIR, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = options.filename || `db_backup_${timestamp}.sql`;
  const backupFile = path.join(backupDir, filename);

  // 确保备份目录存在
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 读取数据库配置
  const { env, config: envConfig } = getDbEnv();

  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  // Docker 形态（#442）：pg_dump 在 cloudcad-pg 容器内执行，产物经 docker cp
  // 取回宿主备份目录（避免整份 dump 缓冲在宿主内存）。
  const dockerCtx = deps.dockerExec !== undefined ? deps.dockerExec : getDockerExec();
  if (dockerCtx) {
    const containerTmp = `/tmp/${filename}`;
    const dumpArgs = [
      '-h',
      dbHost,
      '-p',
      dbPort,
      '-U',
      dbUser,
      '-d',
      dbName,
      '-f',
      containerTmp,
      '--no-owner',
      '--no-privileges',
      '--clean',
      '--if-exists',
    ];
    log(
      'cyan',
      `执行: docker exec ${dockerCtx.container} pg_dump ${dumpArgs.join(' ')}`
    );
    const dumpRes = dockerCtx.exec(
      [
        'exec',
        '-e',
        `PGPASSWORD=${env.PGPASSWORD || ''}`,
        dockerCtx.container,
        'pg_dump',
        ...dumpArgs,
      ],
      300000
    );
    if (!dumpRes.ok) {
      log(
        'red',
        `❌ 数据库备份失败：${dumpRes.stderr || dumpRes.stdout || '未知错误'}`
      );
      return false;
    }
    const cpRes = dockerCtx.exec(
      ['cp', `${dockerCtx.container}:${containerTmp}`, backupFile],
      300000
    );
    dockerCtx.exec(['exec', dockerCtx.container, 'rm', '-f', containerTmp], 15000);
    if (!cpRes.ok || !fs.existsSync(backupFile)) {
      log(
        'red',
        `❌ 备份产物取回失败：${cpRes.stderr || cpRes.error || '未知错误'}`
      );
      return false;
    }
    const size = fs.statSync(backupFile).size;
    log('green', '✅ 数据库备份成功');
    log('cyan', `   文件：${path.relative(PROJECT_ROOT, backupFile)}`);
    log('cyan', `   大小：${formatSize(size)}`);

    // 自动清理旧备份（保留 10 个）
    cleanupOldBackups(10);

    return true;
  }

  // 确定 pg_dump 路径
  const pgDumpPath = getPgDumpPath();
  if (!fs.existsSync(pgDumpPath)) {
    log('red', `❌ 未找到 pg_dump 工具：${pgDumpPath}`);
    return false;
  }

  // 构建命令参数
  const args = [
    '-h',
    dbHost,
    '-p',
    dbPort,
    '-U',
    dbUser,
    '-d',
    dbName,
    '-f',
    backupFile,
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
  ];

  log('cyan', `执行: ${path.basename(pgDumpPath)} ${args.join(' ')}`);

  const result = spawnSync(pgDumpPath, args, {
    env,
    shell: IS_WINDOWS,
    stdio: 'pipe',
    timeout: 120000, // 120 秒超时
  });

  if (result.status === 0 && fs.existsSync(backupFile)) {
    const size = fs.statSync(backupFile).size;
    log('green', `✅ 数据库备份成功`);
    log('cyan', `   文件：${path.relative(PROJECT_ROOT, backupFile)}`);
    log('cyan', `   大小：${formatSize(size)}`);

    // 自动清理旧备份（保留 10 个）
    cleanupOldBackups(10);

    return true;
  } else {
    const errOutput = result.stderr ? result.stderr.toString() : '未知错误';
    log('red', `❌ 数据库备份失败：${errOutput}`);
    return false;
  }
}

/**
 * 列出备份文件
 */
async function listBackups() {
  log('blue', '📋 数据库备份列表');

  const backups = listBackupFiles();
  if (backups.length === 0) {
    log('yellow', '没有找到备份文件');
    return;
  }

  console.log('');
  console.log(
    `${colors.cyan}序号  备份文件名                              大小          创建时间${colors.reset}`
  );
  console.log('─'.repeat(90));

  backups.forEach((backup, index) => {
    const sizeStr = formatSize(backup.size).padStart(12);
    const timeStr = backup.modified.toLocaleString('zh-CN');
    const numStr = (index + 1).toString().padStart(4);

    console.log(`${numStr}  ${backup.name.padEnd(40)} ${sizeStr}  ${timeStr}`);
  });

  console.log('');
  log('cyan', `共 ${backups.length} 个备份`);
}

/**
 * 提示用户选择备份文件
 */
async function promptSelectBackup(backups) {
  console.log('');
  log('cyan', '可用的备份文件：');
  backups.forEach((backup, index) => {
    log('cyan', `  ${index + 1}. ${backup.name} (${formatSize(backup.size)})`);
  });
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      `${colors.yellow}请选择要恢复的备份编号 (或输入 q 取消): ${colors.reset}`,
      (ans) => {
        rl.close();
        resolve(ans.trim());
      }
    );
  });

  if (answer.toLowerCase() === 'q') {
    log('yellow', '已取消恢复');
    return null;
  }

  const index = parseInt(answer, 10) - 1;
  if (isNaN(index) || index < 0 || index >= backups.length) {
    log('red', '❌ 无效的选择');
    return null;
  }

  return backups[index].path;
}

/**
 * 恢复数据库
 * @param {string} backupFile - 备份文件路径（可选）
 * @param {Object} [deps] - 可注入的 IO 缝（测试用）：dockerExec/confirm
 * @returns {Promise<boolean>} - 是否成功
 */
async function restoreDatabase(backupFile, deps = {}) {
  const { confirm = promptConfirm } = deps;
  log('blue', '🔄 数据库恢复');
  console.log('');

  // 如果没有指定文件，列出备份供用户选择
  if (!backupFile) {
    const backups = listBackupFiles();
    if (backups.length === 0) {
      log('red', '❌ 没有找到备份文件');
      return false;
    }

    backupFile = await promptSelectBackup(backups);
    if (!backupFile) return false;
  }

  // 验证备份文件存在
  if (!fs.existsSync(backupFile)) {
    log('red', `❌ 备份文件不存在：${backupFile}`);
    return false;
  }

  // 警告用户并确认
  log('yellow', '⚠️  警告：恢复操作将覆盖当前数据库！');
  log('cyan', `目标备份：${path.relative(PROJECT_ROOT, backupFile)}`);
  console.log('');

  const confirmed = await confirm('是否继续？(yes/no): ');
  if (!confirmed) {
    log('yellow', '已取消恢复');
    return false;
  }

  // 读取数据库配置
  const { env, config: envConfig } = getDbEnv();

  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  // Docker 形态（#442）：清空/恢复经 docker exec 在 cloudcad-pg 容器内执行；
  // Prisma schema 同步 = 重启 app 容器（其 entrypoint 每次启动幂等跑
  // prisma migrate deploy，宿主侧没有 pnpm/Prisma CLI 可用）。
  const dockerCtx = deps.dockerExec !== undefined ? deps.dockerExec : getDockerExec();
  if (dockerCtx) {
    // 步骤 1: 清空数据库（DROP SCHEMA public CASCADE; CREATE SCHEMA public;）
    log('cyan', '步骤 1/3: 清空数据库...');
    const dropRes = dockerCtx.exec(
      [
        'exec',
        '-e',
        `PGPASSWORD=${env.PGPASSWORD || ''}`,
        dockerCtx.container,
        'psql',
        '-h',
        dbHost,
        '-p',
        dbPort,
        '-U',
        dbUser,
        '-d',
        dbName,
        '-c',
        'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
      ],
      120000
    );
    if (!dropRes.ok) {
      log('red', `❌ 清空数据库失败: ${dropRes.stderr || dropRes.stdout}`);
      return false;
    }
    log('green', '✓ 数据库已清空');

    // 步骤 2: 恢复备份（docker cp 进容器 + psql -f）
    log('cyan', '步骤 2/3: 恢复备份...');
    const containerTmp = '/tmp/cloudcad-restore.sql';
    const cpRes = dockerCtx.exec(
      ['cp', backupFile, `${dockerCtx.container}:${containerTmp}`],
      300000
    );
    if (!cpRes.ok) {
      log('red', `❌ 备份文件拷入容器失败: ${cpRes.stderr || cpRes.error || '未知错误'}`);
      return false;
    }
    const restoreRes = dockerCtx.exec(
      [
        'exec',
        '-i',
        '-e',
        `PGPASSWORD=${env.PGPASSWORD || ''}`,
        dockerCtx.container,
        'psql',
        '-h',
        dbHost,
        '-p',
        dbPort,
        '-U',
        dbUser,
        '-d',
        dbName,
        '-f',
        containerTmp,
      ],
      300000
    );
    dockerCtx.exec(['exec', dockerCtx.container, 'rm', '-f', containerTmp], 15000);
    if (!restoreRes.ok) {
      log(
        'red',
        `❌ 数据库恢复失败: ${restoreRes.stderr || restoreRes.stdout || '未知错误'}`
      );
      return false;
    }
    log('green', '✓ 备份恢复成功');

    // 步骤 3: 同步 Prisma schema（重启 app 容器触发 entrypoint 的 migrate deploy）
    log('cyan', '步骤 3/3: 同步 Prisma schema（重启 app 容器）...');
    const restartRes = dockerCtx.exec(['restart', 'cloudcad-app'], 180000);
    if (restartRes.ok) {
      log('green', '✅ 数据库恢复完成，Prisma schema 已同步');
      return true;
    }
    log(
      'yellow',
      `⚠️  数据库恢复成功，但 app 容器重启失败（${restartRes.stderr || restartRes.error}），请重跑 ./start.sh 触发 schema 同步`
    );
    return true;
  }

  // 确定 psql 路径
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    log('red', `❌ 未找到 psql 工具：${psqlPath}`);
    return false;
  }

  // 步骤 1: 清空数据库（DROP SCHEMA public CASCADE; CREATE SCHEMA public;）
  log('cyan', '步骤 1/3: 清空数据库...');
  const dropSchemaCmd = `"${psqlPath}" -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
  const dropResult = spawnSync(dropSchemaCmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (dropResult.status !== 0) {
    log('red', `❌ 清空数据库失败: ${dropResult.stderr || dropResult.stdout}`);
    return false;
  }
  log('green', '✓ 数据库已清空');

  // 步骤 2: 恢复备份
  log('cyan', '步骤 2/3: 恢复备份...');
  const restoreArgs = [
    '-h',
    dbHost,
    '-p',
    dbPort,
    '-U',
    dbUser,
    '-d',
    dbName,
    '-f',
    backupFile,
  ];

  log('cyan', `执行: ${path.basename(psqlPath)} ${restoreArgs.join(' ')}`);
  console.log('');

  const restoreResult = spawnSync(psqlPath, restoreArgs, {
    env,
    shell: IS_WINDOWS,
    stdio: 'inherit', // 显示实时进度
    timeout: 180000, // 180 秒超时
  });

  console.log('');

  if (restoreResult.status !== 0) {
    log('red', '❌ 数据库恢复失败');
    return false;
  }
  log('green', '✓ 备份恢复成功');

  // 步骤 3: 同步 Prisma schema（让 Prisma 的 migration 表与当前代码一致）
  log('cyan', '步骤 3/3: 同步 Prisma schema...');
  
  // 运行 prisma migrate deploy
  const prismaExec = PNPM_JS && fs.existsSync(PNPM_JS)
    ? [PNPM_JS, '-F', 'backend', 'exec', 'prisma']
    : ['-F', 'backend', 'exec', 'prisma'];
  
  const migrateResult = spawnSync(
    PNPM_JS && fs.existsSync(PNPM_JS) ? NODE_EXE : 'pnpm',
    [...prismaExec, 'migrate', 'deploy'],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: IS_WINDOWS,
      stdio: 'inherit',
      timeout: 60000,
      env: { ...process.env, PGOPTIONS: '-c jit=off' },
    }
  );
  
  console.log('');
  
  if (migrateResult.status === 0) {
    log('green', '✅ 数据库恢复完成，Prisma schema 已同步');
    return true;
  } else {
    log('yellow', '⚠️  数据库恢复成功，但 Prisma schema 同步失败');
    log('cyan', `下次启动会由 ${OPS_ENTRY} start 自动补齐；也可立即手动执行: ${OPS_ENTRY} migrate`);
    return true; // 恢复成功，但迁移同步失败
  }
}

/**
 * 清理旧备份
 * @param {number} maxBackups - 保留数量（默认 10）
 * @returns {Promise<{deleted: number, kept: number}>}
 */
async function cleanupOldBackups(maxBackups = 10) {
  const backups = listBackupFiles();
  if (backups.length <= maxBackups) {
    if (backups.length > 0) {
      log(
        'cyan',
        `备份文件数量 (${backups.length}) 未超过限制 (${maxBackups})，无需清理`
      );
    }
    return { deleted: 0, kept: backups.length };
  }

  const toDelete = backups.slice(maxBackups);
  let deleted = 0;

  log('blue', `🧹 正在清理旧备份，保留最新的 ${maxBackups} 个...`);

  for (const backup of toDelete) {
    try {
      fs.unlinkSync(backup.path);
      log('cyan', `   已清理：${backup.name}`);
      deleted++;
    } catch (err) {
      log('yellow', `   清理失败：${backup.name} - ${err.message}`);
    }
  }

  log(
    'green',
    `清理完成：删除 ${deleted} 个，保留 ${backups.length - deleted} 个`
  );
  return { deleted, kept: backups.length - deleted };
}

/**
 * 数据库备份与恢复子菜单（交互式）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js 的 databaseBackupMenu（行号会随拆分漂移，不记）。
 */
async function databaseBackupMenu() {
  while (true) {
    clearScreen();
    printHeader();
    log('bright', '>>> 数据库备份与恢复');
    console.log('');

    console.log(`${colors.cyan}请选择操作：${colors.reset}`);
    console.log('');
    console.log(`  ${colors.cyan}[1]${colors.reset} 手动备份数据库`);
    console.log(`  ${colors.cyan}[2]${colors.reset} 恢复数据库`);
    console.log(`  ${colors.cyan}[3]${colors.reset} 查看备份列表`);
    console.log(`  ${colors.cyan}[4]${colors.reset} 清理旧备份`);
    console.log(`  ${colors.cyan}[q]${colors.reset} 返回主菜单`);
    console.log('');

    const choice = await prompt();

    switch (choice) {
      case '1':
        await backupDatabase();
        break;
      case '2':
        await restoreDatabase();
        break;
      case '3':
        await listBackups();
        break;
      case '4':
        await cleanupOldBackups();
        break;
      case 'q':
        return;
      default:
        log('red', '无效选项');
    }

    if (choice !== 'q') {
      console.log('');
      await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(`${colors.bright}按回车键继续...${colors.reset}`, () => {
          rl.close();
          resolve();
        });
      });
    }
  }
}

module.exports = {
  listBackupFiles,
  formatSize,
  getPgDumpPath,
  getPsqlPath,
  getEnvPath,
  getDockerExec,
  getDbEnv,
  checkDatabaseExists,
  isDatabaseEmpty,
  countUsers,
  backupDatabase,
  listBackups,
  promptSelectBackup,
  restoreDatabase,
  cleanupOldBackups,
  databaseBackupMenu,
};
