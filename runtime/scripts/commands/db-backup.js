/**
 * @fileoverview 数据库备份 / 恢复 / 清理 命令域
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - listBackupFiles / formatSize / getPgDumpPath / getPsqlPath
 *   getPostgresLibPath / getRuntimeLibPaths / getDbEnv / checkDatabaseExists
 *   isDatabaseEmpty / backupDatabase / listBackups / promptSelectBackup
 *   restoreDatabase / cleanupOldBackups
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
} = require('../lib/context');
const { colors, log } = require('../lib/logger');
const { parseEnvFile } = require('../lib/env');
const { promptConfirm } = require('../lib/prompt');

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
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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
    path.join(PLATFORM_DIR, 'postgres', 'lib'),
    path.join(PLATFORM_DIR, 'subversion', 'lib'),
    // 如果有其他运行时库，也加到这里
  ].filter(p => fs.existsSync(p));
  
  return paths.join(':');
}

/**
 * 构建数据库命令的环境变量
 */
function getDbEnv() {
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  const envConfig = parseEnvFile(envPath);

  return {
    env: {
      ...process.env,
      PGPASSWORD: envConfig.DB_PASSWORD || '',
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
 * 检查数据库是否存在
 */
async function checkDatabaseExists(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return false;
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

  // 命令执行成功，检查输出
  if (result.status === 0) {
    return result.stdout && result.stdout.trim() === '1';
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

  // 其他错误（如 psql 不存在）- 无法确定
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
 * 备份数据库
 * @param {Object} options - 选项
 * @param {string} options.backupDir - 备份目录（可选）
 * @param {string} options.filename - 文件名（可选）
 * @returns {Promise<boolean>} - 是否成功
 */
async function backupDatabase(options = {}) {
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
 * @returns {Promise<boolean>} - 是否成功
 */
async function restoreDatabase(backupFile) {
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

  const confirmed = await promptConfirm('是否继续？(yes/no): ');
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
    log('cyan', '请手动运行: pnpm --filter backend prisma migrate deploy');
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

module.exports = {
  listBackupFiles,
  formatSize,
  getPgDumpPath,
  getPsqlPath,
  getDbEnv,
  checkDatabaseExists,
  isDatabaseEmpty,
  backupDatabase,
  listBackups,
  promptSelectBackup,
  restoreDatabase,
  cleanupOldBackups,
};
