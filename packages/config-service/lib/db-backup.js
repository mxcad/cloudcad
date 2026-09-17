const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { log } = require('./utils');
const { BACKUP_DIR, ENV_PATH, RUNTIME_DIR } = require('./constants');
const { parseEnvFile } = require('./env');

/**
 * 备份文件名格式校验（唯一事实源，与 backupDatabase 生成的 `db_backup_<ISO 时间戳>.sql`
 * 一致）。严格 `^db_backup_[\w-]+\.sql$`：
 * - 无 `/` `\` `..` → 排除路径遍历（decodeURIComponent 会把 %2e%2e%2f 还原成 ..）；
 * - 无 shell 元字符（& ; | 空格等）→ 排除 restore 走 `shell:true` 时的命令注入。
 */
function isValidBackupFilename(filename) {
  return typeof filename === 'string' && /^db_backup_[\w-]+\.sql$/.test(filename);
}

function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => isValidBackupFilename(file))
    .map((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

function formatBackupSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getPgDumpPath() {
  const isWindows = process.platform === 'win32';
  const platformDir = isWindows ? 'windows' : 'linux';
  const runtimePath = path.join(RUNTIME_DIR, platformDir);

  if (fs.existsSync(runtimePath)) {
    return isWindows
      ? path.join(runtimePath, 'postgresql', 'pgsql', 'bin', 'pg_dump.exe')
      : path.join(runtimePath, 'postgres', 'bin', 'pg_dump');
  }
  return isWindows ? 'pg_dump.exe' : 'pg_dump';
}

function getPsqlPath() {
  const isWindows = process.platform === 'win32';
  const platformDir = isWindows ? 'windows' : 'linux';
  const runtimePath = path.join(RUNTIME_DIR, platformDir);

  if (fs.existsSync(runtimePath)) {
    return isWindows
      ? path.join(runtimePath, 'postgresql', 'pgsql', 'bin', 'psql.exe')
      : path.join(runtimePath, 'postgres', 'bin', 'psql');
  }
  return isWindows ? 'psql.exe' : 'psql';
}

function getPostgresLibPath() {
  const isWindows = process.platform === 'win32';
  const platformDir = isWindows ? 'windows' : 'linux';
  return path.join(RUNTIME_DIR, platformDir, 'postgres', 'lib');
}

function getRedisCliPath() {
  const isWindows = process.platform === 'win32';
  const platformDir = isWindows ? 'windows' : 'linux';
  const runtimePath = path.join(RUNTIME_DIR, platformDir);

  if (fs.existsSync(runtimePath)) {
    return isWindows
      ? path.join(runtimePath, 'redis', 'redis-cli.exe')
      : path.join(runtimePath, 'redis', 'redis-cli');
  }
  return isWindows ? 'redis-cli.exe' : 'redis-cli';
}

function getDbEnv() {
  const envConfig = parseEnvFile(ENV_PATH);
  const isWindows = process.platform === 'win32';

  return {
    env: {
      ...process.env,
      PGPASSWORD: envConfig.DB_PASSWORD || '',
      ...(!isWindows && fs.existsSync(getPostgresLibPath())
        ? {
            LD_LIBRARY_PATH: getPostgresLibPath(),
          }
        : {}),
    },
    config: envConfig,
  };
}

async function backupDatabase() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `db_backup_${timestamp}.sql`;
  const backupFile = path.join(BACKUP_DIR, filename);

  const { env, config: envConfig } = getDbEnv();
  const pgDumpPath = getPgDumpPath();

  if (!fs.existsSync(pgDumpPath)) {
    log('error', `pg_dump 不存在: ${pgDumpPath}`);
    return { success: false, error: 'pg_dump 工具不存在' };
  }

  const args = [
    '-h',
    envConfig.DB_HOST || 'localhost',
    '-p',
    envConfig.DB_PORT || '5432',
    '-U',
    envConfig.DB_USERNAME || 'postgres',
    '-d',
    envConfig.DB_DATABASE || 'cloudcad',
    '-f',
    backupFile,
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
  ];

  log('info', `执行数据库备份: ${args.join(' ')}`);

  const result = spawnSync(pgDumpPath, args, {
    env,
    shell: process.platform === 'win32',
    stdio: 'pipe',
    timeout: 120000,
  });

  if (result.status === 0 && fs.existsSync(backupFile)) {
    const size = fs.statSync(backupFile).size;
    log('info', `数据库备份成功: ${filename} (${formatBackupSize(size)})`);
    return { success: true, filename, size };
  } else {
    const error = result.stderr ? result.stderr.toString() : '未知错误';
    log('error', `数据库备份失败: ${error}`);
    return { success: false, error };
  }
}

async function restoreDatabase(filename) {
  // filename 来自请求体，restore 走 shell:true（Windows）——非法格式会致路径遍历 + 命令注入
  if (!isValidBackupFilename(filename)) {
    return { success: false, error: '非法的备份文件名' };
  }
  const backupFile = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(backupFile)) {
    return { success: false, error: '备份文件不存在' };
  }

  const { env, config: envConfig } = getDbEnv();
  const psqlPath = getPsqlPath();

  if (!fs.existsSync(psqlPath)) {
    return { success: false, error: 'psql 工具不存在' };
  }

  const args = [
    '-h',
    envConfig.DB_HOST || 'localhost',
    '-p',
    envConfig.DB_PORT || '5432',
    '-U',
    envConfig.DB_USERNAME || 'postgres',
    '-d',
    envConfig.DB_DATABASE || 'cloudcad',
    '-f',
    backupFile,
  ];

  log('info', `恢复数据库: ${filename}`);

  const result = spawnSync(psqlPath, args, {
    env,
    shell: process.platform === 'win32',
    stdio: 'pipe',
    timeout: 180000,
  });

  if (result.status === 0) {
    log('info', `数据库恢复成功: ${filename}`);
    return { success: true };
  } else {
    const error = result.stderr ? result.stderr.toString() : '未知错误';
    log('error', `数据库恢复失败: ${error}`);
    return { success: false, error };
  }
}

async function cleanupOldBackups(maxBackups = 10) {
  const backups = listBackupFiles();
  if (backups.length <= maxBackups) {
    return { deleted: 0, kept: backups.length };
  }

  const toDelete = backups.slice(maxBackups);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      fs.unlinkSync(backup.path);
      deleted++;
    } catch (err) {
      log('warn', `清理备份失败: ${backup.name} - ${err.message}`);
    }
  }

  log(
    'info',
    `清理旧备份完成: 删除 ${deleted} 个，保留 ${backups.length - deleted} 个`
  );
  return { deleted, kept: backups.length - deleted };
}

module.exports = {
  listBackupFiles,
  backupDatabase,
  restoreDatabase,
  cleanupOldBackups,
  isValidBackupFilename,
  getPgDumpPath,
  getPsqlPath,
  getRedisCliPath,
  getDbEnv,
};
