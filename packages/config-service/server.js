/**
 * CloudCAD 部署配置中心
 * 0 依赖独立服务，纯 Node.js 原生模块实现
 *
 * 端口: 3002
 * 认证: 使用 INITIAL_ADMIN_PASSWORD
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const net = require('net');

const brand = require('./brand');
const uiConfig = require('./ui-config');
const themeConfig = require('./theme-config');
const serverConfig = require('./server-config');
const sketchesConfig = require('./sketches-config');
const quickCommandConfig = require('./quick-command-config');

// ==================== 配置 ====================

const PORT = process.env.CONFIG_SERVICE_PORT || 3002;
const SESSION_TTL = 30 * 60 * 1000; // 30 分钟
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 分钟

// 路径配置
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'packages', 'backend');
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const PUBLIC_DIR = path.join(__dirname, 'public');
const FRONTEND_DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');
const ECOSYSTEM_PATH = path.join(RUNTIME_DIR, 'ecosystem.config.js');

// 基础服务列表（由 ecosystem.config.js 管理）
const INFRASTRUCTURE_SERVICES = ['postgresql', 'redis', 'cooperate'];

// ==================== 工具函数 ====================

function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseMultipart(req) {
  return new Promise((resolve) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!boundaryMatch) {
      resolve({ error: '无法解析 multipart boundary' });
      return;
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer
        .toString('binary')
        .split(`--${boundary}`)
        .filter(Boolean);

      for (const part of parts) {
        const lines = part.split(/\r?\n/);
        const headerLine = lines[0];

        if (!headerLine.includes('Content-Disposition')) continue;

        const nameMatch = headerLine.match(/name="([^"]+)"/);
        const filenameMatch = headerLine.match(/filename="([^"]+)"/);

        if (!filenameMatch) continue;

        const contentTypeMatch = lines[1]?.match(/Content-Type:\s*([^\s]+)/i);
        const filename = filenameMatch[1];

        let bodyStartIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] === '') {
            bodyStartIndex = i + 1;
            break;
          }
        }

        const bodyStr = lines.slice(bodyStartIndex).join('\r\n');
        const headerEndIndex = buffer.indexOf('\r\n\r\n') + 4;
        const bodyStart = part.indexOf('\r\n\r\n') + 4;
        const bodyEnd = part.length - (part.endsWith('\r\n') ? 2 : 0);
        const fileBuffer = buffer.slice(
          buffer.indexOf(part) + bodyStart,
          buffer.indexOf(part) + bodyEnd
        );

        resolve({
          file: {
            fieldname: nameMatch[1],
            filename,
            contentType: contentTypeMatch
              ? contentTypeMatch[1]
              : 'application/octet-stream',
            buffer: fileBuffer,
          },
        });
        return;
      }

      resolve({ error: '未找到文件' });
    });
    req.on('error', () => resolve({ error: '请求错误' }));
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ==================== .env 文件操作 ====================

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });

  return result;
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : '';

  Object.entries(updates).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
}

// ==================== 数据库备份与恢复 ====================

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => file.startsWith('db_backup_') && file.endsWith('.sql'))
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

// ==================== 配置项定义 ====================

/**
 * controllable 说明:
 * - true: 应用配置（可控）- 修改后重启服务即可生效
 * - false: 基础设施配置（不可控）- 修改需同时修改对应服务配置，否则会导致连接失败
 */
const CONFIG_GROUPS = [
  {
    name: '服务配置',
    key: 'service',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      { key: 'PORT', label: '服务端口', type: 'number', sensitive: false },
      {
        key: 'FRONTEND_URL',
        label: '前端地址',
        type: 'text',
        sensitive: false,
      },
    ],
  },
  {
    name: '安全配置',
    key: 'security',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      {
        key: 'JWT_SECRET',
        label: 'JWT 密钥',
        type: 'secret',
        sensitive: true,
        canGenerate: true,
      },
    ],
  },
  {
    name: '邮件配置',
    key: 'mail',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      { key: 'MAIL_HOST', label: 'SMTP 主机', type: 'text', sensitive: false },
      {
        key: 'MAIL_PORT',
        label: 'SMTP 端口',
        type: 'number',
        sensitive: false,
      },
      {
        key: 'MAIL_SECURE',
        label: '启用 TLS',
        type: 'boolean',
        sensitive: false,
      },
      { key: 'MAIL_USER', label: 'SMTP 用户', type: 'text', sensitive: false },
      {
        key: 'MAIL_PASSWORD',
        label: 'SMTP 密码',
        type: 'password',
        sensitive: true,
      },
      { key: 'MAIL_FROM', label: '发件人', type: 'text', sensitive: false },
    ],
  },
  {
    name: '数据库配置',
    key: 'database',
    controllable: false,
    description:
      '⚠️ 修改此项需同时修改 PostgreSQL 服务配置，否则会导致连接失败',
    items: [
      { key: 'DB_HOST', label: '数据库主机', type: 'text', sensitive: false },
      { key: 'DB_PORT', label: '数据库端口', type: 'number', sensitive: false },
      {
        key: 'DB_DATABASE',
        label: '数据库名称',
        type: 'text',
        sensitive: false,
      },
      {
        key: 'DB_USERNAME',
        label: '数据库用户',
        type: 'text',
        sensitive: false,
      },
      {
        key: 'DB_PASSWORD',
        label: '数据库密码',
        type: 'password',
        sensitive: true,
      },
    ],
  },
  {
    name: 'Redis 配置',
    key: 'redis',
    controllable: false,
    description: '⚠️ 修改此项需同时修改 Redis 服务配置，否则会导致连接失败',
    items: [
      {
        key: 'REDIS_HOST',
        label: 'Redis 主机',
        type: 'text',
        sensitive: false,
      },
      {
        key: 'REDIS_PORT',
        label: 'Redis 端口',
        type: 'number',
        sensitive: false,
      },
      {
        key: 'REDIS_PASSWORD',
        label: 'Redis 密码',
        type: 'password',
        sensitive: true,
      },
    ],
  },
];

// ==================== Session 管理 ====================

const sessions = new Map();
const loginAttempts = new Map();
const downloadTokens = new Map(); // 一次性下载凭证

function createSession(username) {
  const token = generateToken();
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
  });
  return token;
}

function validateSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

// 生成一次性下载凭证（5分钟有效）
function createDownloadToken(filename) {
  const downloadToken = generateToken();
  downloadTokens.set(downloadToken, {
    filename,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟
  });
  return downloadToken;
}

// 验证并消费一次性下载凭证
function consumeDownloadToken(downloadToken) {
  const data = downloadTokens.get(downloadToken);
  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    downloadTokens.delete(downloadToken);
    return null;
  }

  downloadTokens.delete(downloadToken); // 一次性使用
  return data.filename;
}

function checkLoginLock(ip) {
  const attempts = loginAttempts.get(ip);
  if (!attempts) return { locked: false };

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed < LOCKOUT_TIME) {
      return {
        locked: true,
        remaining: Math.ceil((LOCKOUT_TIME - elapsed) / 1000),
      };
    }
    loginAttempts.delete(ip);
  }
  return { locked: false };
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
  } else {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
  }
}

// ==================== 连接测试 ====================

async function testDatabase(config) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: '连接超时' });
    }, 5000);

    socket.connect(config.port, config.host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

async function testRedis(config) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: '连接超时' });
    }, 5000);

    socket.connect(config.port, config.host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

// ==================== 服务控制 ====================

const PM2_SERVICES = [
  'postgresql',
  'redis',
  'cooperate',
  'config-service',
  'backend',
  'frontend',
];

function runPm2Command(args, options = {}) {
  try {
    // 使用 pm2.cmd/pm2 包装脚本（确保 PM2 daemon 能找到 node）
    const pm2Cmd =
      process.platform === 'win32'
        ? path.join(PROJECT_ROOT, 'pm2.cmd')
        : path.join(PROJECT_ROOT, 'pm2');

    const result = spawnSync(pm2Cmd, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: true,
      timeout: 30000,
      env: {
        ...process.env,
        ...options.env,
        PM2_HOME,
      },
    });

    return {
      success: result.status === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAllServicesStatus() {
  const result = runPm2Command(['jlist']);

  if (!result.success) {
    return { success: false, error: result.stderr || result.error };
  }

  try {
    const processes = JSON.parse(result.stdout || '[]');
    const statusMap = {};

    processes.forEach((proc) => {
      statusMap[proc.name] = {
        status: proc.pm2_env?.status || 'unknown',
        uptime: proc.pm2_env?.pm_uptime || 0,
        memory: proc.monit?.memory || 0,
        cpu: proc.monit?.cpu || 0,
        restarts: proc.pm2_env?.restart_time || 0,
      };
    });

    // 补充未运行的服务
    PM2_SERVICES.forEach((name) => {
      if (!statusMap[name]) {
        statusMap[name] = {
          status: 'stopped',
          uptime: 0,
          memory: 0,
          cpu: 0,
          restarts: 0,
        };
      }
    });

    return { success: true, services: statusMap };
  } catch (err) {
    return { success: false, error: '解析 PM2 状态失败' };
  }
}

function restartService(serviceName) {
  // 不允许重启 config-service 自己
  if (serviceName === 'config-service') {
    return { success: false, error: '不能重启配置中心服务' };
  }

  const result = runPm2Command(['restart', serviceName]);
  log('info', `重启服务: ${serviceName}`);
  return result;
}

function stopService(serviceName) {
  // 不允许停止 config-service 自己
  if (serviceName === 'config-service') {
    return { success: false, error: '不能停止配置中心服务' };
  }

  const result = runPm2Command(['stop', serviceName]);
  log('info', `停止服务: ${serviceName}`);
  return result;
}

function startService(serviceName) {
  // config-service 已经在运行
  if (serviceName === 'config-service') {
    return { success: false, error: '配置中心服务已在运行' };
  }

  // 基础服务使用 ecosystem.config.js 启动
  if (INFRASTRUCTURE_SERVICES.includes(serviceName)) {
    if (!fs.existsSync(ECOSYSTEM_PATH)) {
      return { success: false, error: 'PM2 配置文件不存在' };
    }
    const result = runPm2Command([
      'start',
      ECOSYSTEM_PATH,
      '--only',
      serviceName,
    ]);
    log('info', `启动服务: ${serviceName}`);
    return result;
  }

  // backend 和 frontend 使用部署配置启动
  if (serviceName === 'backend' || serviceName === 'frontend') {
    const tempConfigPath = path.join(
      PROJECT_ROOT,
      'data',
      'pm2-deploy.config.js'
    );
    if (fs.existsSync(tempConfigPath)) {
      const result = runPm2Command([
        'start',
        tempConfigPath,
        '--only',
        serviceName,
      ]);
      log('info', `启动服务: ${serviceName}`);
      return result;
    } else {
      return { success: false, error: '部署配置不存在，请先部署' };
    }
  }

  const result = runPm2Command(['start', serviceName]);
  log('info', `启动服务: ${serviceName}`);
  return result;
}

// ==================== 认证中间件 ====================

function authMiddleware(req, res) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const session = validateSession(token);

  if (!session) {
    sendJson(res, 401, { error: '未登录或会话已过期' });
    return null;
  }
  return session;
}

// ==================== API 路由 ====================

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ========== 认证相关 ==========

  // 登录
  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    const lockStatus = checkLoginLock(ip);

    if (lockStatus.locked) {
      sendJson(res, 429, {
        error: `登录失败次数过多，请 ${lockStatus.remaining} 秒后重试`,
      });
      return;
    }

    const body = await parseBody(req);
    const env = parseEnvFile(ENV_PATH);
    const adminPassword = env.INITIAL_ADMIN_PASSWORD || 'Admin123!';

    if (body.password === adminPassword) {
      recordLoginAttempt(ip, true);
      const token = createSession('admin');
      log('info', '管理员登录成功');
      sendJson(res, 200, { success: true, token });
    } else {
      recordLoginAttempt(ip, false);
      log('warn', `登录失败，IP: ${ip}`);
      sendJson(res, 401, { error: '密码错误' });
    }
    return;
  }

  // 登出
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) destroySession(token);
    sendJson(res, 200, { success: true });
    return;
  }

  // 检查登录状态
  if (pathname === '/api/auth/status' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;
    sendJson(res, 200, { authenticated: true, username: session.username });
    return;
  }

  // ========== 配置管理 ==========

  // 获取配置结构
  if (pathname === '/api/config/schema' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;
    sendJson(res, 200, { groups: CONFIG_GROUPS });
    return;
  }

  // 获取所有配置
  if (pathname === '/api/config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const env = parseEnvFile(ENV_PATH);
    const config = {};

    CONFIG_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        const value = env[item.key] || '';
        if (item.sensitive) {
          config[item.key] = value ? '(已设置)' : '(未设置)';
        } else {
          config[item.key] = value;
        }
      });
    });

    sendJson(res, 200, { config, env });
    return;
  }

  // 更新配置
  if (pathname === '/api/config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const updates = body.updates || {};

    // 过滤掉敏感字段的占位符
    Object.keys(updates).forEach((key) => {
      if (updates[key] === '(已设置)' || updates[key] === '(未设置)') {
        delete updates[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      sendJson(res, 400, { error: '没有有效的更新内容' });
      return;
    }

    // 如果任一数据库配置变更，同步更新 DATABASE_URL
    const dbConfigKeys = [
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
    ];
    const hasDbConfigChange = dbConfigKeys.some((key) => updates[key]);

    if (hasDbConfigChange) {
      const env = parseEnvFile(ENV_PATH);
      const dbHost = updates.DB_HOST || env.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || env.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || env.DB_DATABASE || 'cloudcad';
      const dbUser = updates.DB_USERNAME || env.DB_USERNAME || 'postgres';
      const dbPassword = updates.DB_PASSWORD || env.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    updateEnvFile(ENV_PATH, updates);
    log('info', `配置已更新: ${Object.keys(updates).join(', ')}`);

    sendJson(res, 200, {
      success: true,
      message: '配置已保存，需要重启服务才能生效',
    });
    return;
  }

  // 重新生成 JWT 密钥
  if (pathname === '/api/config/regenerate-jwt' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const newSecret = crypto.randomBytes(64).toString('hex');
    updateEnvFile(ENV_PATH, { JWT_SECRET: newSecret });
    log('info', 'JWT 密钥已重新生成');

    sendJson(res, 200, {
      success: true,
      message: 'JWT 密钥已重新生成，需要重启服务才能生效',
    });
    return;
  }

  // 修改管理员密码
  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return;
    }

    // 验证旧密码
    const env = parseEnvFile(ENV_PATH);
    const currentPassword = env.INITIAL_ADMIN_PASSWORD || 'Admin123!';

    if (oldPassword !== currentPassword) {
      sendJson(res, 400, { error: '旧密码错误' });
      return;
    }

    // 检查新密码强度
    if (newPassword.length < 8) {
      sendJson(res, 400, { error: '新密码长度至少 8 位' });
      return;
    }

    // 更新密码
    updateEnvFile(ENV_PATH, { INITIAL_ADMIN_PASSWORD: newPassword });
    log('info', '管理员密码已修改');

    sendJson(res, 200, { success: true, message: '密码已修改' });
    return;
  }

  // ========== 品牌配置 ==========

  // 获取品牌配置（公开接口）
  if (pathname === '/api/brand' && method === 'GET') {
    const config = brand.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新品牌配置
  if (pathname === '/api/brand' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = brand.validateConfig(body);

    if (errors.length > 0) {
      sendJson(res, 400, { success: false, error: errors.join(', ') });
      return;
    }

    const config = brand.updateConfig(body);
    log('info', `品牌配置已更新: ${Object.keys(body).join(', ')}`);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 上传 Logo
  if (pathname === '/api/brand/logo' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, 400, {
        success: false,
        error: '需要 multipart/form-data 格式',
      });
      return;
    }

    const { file, error } = await parseMultipart(req);

    if (error) {
      sendJson(res, 400, { success: false, error });
      return;
    }

    if (!file || file.fieldname !== 'logo') {
      sendJson(res, 400, {
        success: false,
        error: '请上传名为 logo 的图片文件',
      });
      return;
    }

    const result = brand.uploadLogo(file.buffer, file.contentType);

    if (!result.success) {
      sendJson(res, 400, result);
      return;
    }

    log('info', `Logo 已上传: ${file.filename}`);
    sendJson(res, 200, { success: true, message: 'Logo 上传成功' });
    return;
  }

  // ========== 连接测试 ==========

  if (pathname === '/api/test/database' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const env = parseEnvFile(ENV_PATH);
    const result = await testDatabase({
      host: env.DB_HOST || 'localhost',
      port: parseInt(env.DB_PORT || '5432'),
    });

    sendJson(res, 200, result);
    return;
  }

  if (pathname === '/api/test/redis' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const env = parseEnvFile(ENV_PATH);
    const result = await testRedis({
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379'),
    });

    sendJson(res, 200, result);
    return;
  }

  // ========== 服务控制 ==========

  // 获取所有服务状态
  if (pathname === '/api/service/status' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const result = getAllServicesStatus();
    sendJson(res, result.success ? 200 : 500, result);
    return;
  }

  // 重启指定服务
  if (pathname.match(/^\/api\/service\/[^/]+\/restart$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const serviceName = pathname.split('/')[3];
    const result = restartService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return;
  }

  // 停止指定服务
  if (pathname.match(/^\/api\/service\/[^/]+\/stop$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const serviceName = pathname.split('/')[3];
    const result = stopService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return;
  }

  // 启动指定服务
  if (pathname.match(/^\/api\/service\/[^/]+\/start$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const serviceName = pathname.split('/')[3];
    const result = startService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return;
  }

  // ========== 数据库备份与恢复 ==========

  // 获取备份列表
  if (pathname === '/api/db/backups' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const backups = listBackupFiles();
    sendJson(res, 200, { success: true, backups });
    return;
  }

  // 执行备份
  if (pathname === '/api/db/backup' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const result = await backupDatabase();
    sendJson(res, result.success ? 200 : 500, result);
    return;
  }

  // 恢复数据库
  if (pathname === '/api/db/restore' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const { filename, confirm } = body;

    if (!confirm) {
      sendJson(res, 400, { success: false, error: '需要确认恢复操作' });
      return;
    }

    if (!filename) {
      sendJson(res, 400, { success: false, error: '需要指定备份文件名' });
      return;
    }

    const result = await restoreDatabase(filename);
    sendJson(res, result.success ? 200 : 500, result);
    return;
  }

  // 清理旧备份
  if (pathname === '/api/db/cleanup' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const maxBackups = body.maxBackups || 10;

    const result = await cleanupOldBackups(maxBackups);
    sendJson(res, 200, { success: true, ...result });
    return;
  }

  // 下载备份文件（使用一次性凭证）
  if (pathname.match(/^\/api\/db\/download\//) && method === 'GET') {
    // 从 URL 查询参数获取下载凭证
    const downloadToken = searchParams.get('token');

    if (!downloadToken) {
      sendJson(res, 401, { error: '缺少下载凭证' });
      return;
    }

    const filename = consumeDownloadToken(downloadToken);
    if (!filename) {
      sendJson(res, 401, { error: '下载凭证无效或已过期' });
      return;
    }

    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: '备份文件不存在' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fs.statSync(filePath).size,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 获取下载凭证（需要会话认证）
  if (pathname === '/api/db/download-token' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const { filename } = body;

    if (!filename) {
      sendJson(res, 400, { error: '需要指定文件名' });
      return;
    }

    const downloadToken = createDownloadToken(filename);
    sendJson(res, 200, { success: true, downloadToken });
    return;
  }

  // 删除备份文件
  if (pathname.match(/^\/api\/db\/backup\//) && method === 'DELETE') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const filename = decodeURIComponent(pathname.split('/').pop());
    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { success: false, error: '备份文件不存在' });
      return;
    }

    try {
      fs.unlinkSync(filePath);
      log('info', `已删除备份: ${filename}`);
      sendJson(res, 200, { success: true, message: '已删除' });
    } catch (err) {
      log('error', `删除备份失败: ${err.message}`);
      sendJson(res, 500, { success: false, error: '删除失败' });
    }
    return;
  }

  // ========== UI 配置 ==========

  // 获取 UI 配置
  if (pathname === '/api/ui-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = uiConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新 UI 配置
  if (pathname === '/api/ui-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = uiConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = uiConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 重置 UI 配置为默认
  if (pathname === '/api/ui-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = uiConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 导出 UI 配置
  if (pathname === '/api/ui-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = uiConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myUiConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 导入 UI 配置
  if (pathname === '/api/ui-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = uiConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = uiConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // ========== 主题配置 ==========

  // 获取主题配置
  if (pathname === '/api/theme-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = themeConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新主题配置
  if (pathname === '/api/theme-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = themeConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = themeConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 重置主题配置为默认
  if (pathname === '/api/theme-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = themeConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 导出主题配置
  if (pathname === '/api/theme-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = themeConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myVuetifyThemeConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 导入主题配置
  if (pathname === '/api/theme-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = themeConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = themeConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // ========== 服务器配置 ==========

  // 获取服务器配置
  if (pathname === '/api/server-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = serverConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新服务器配置
  if (pathname === '/api/server-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = serverConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = serverConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 导出服务器配置
  if (pathname === '/api/server-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = serverConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myServerConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 导入服务器配置
  if (pathname === '/api/server-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = serverConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = serverConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // ========== 草图配置 ==========

  // 获取草图配置
  if (pathname === '/api/sketches-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = sketchesConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新草图配置
  if (pathname === '/api/sketches-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = sketchesConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = sketchesConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 重置草图配置为默认
  if (pathname === '/api/sketches-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = sketchesConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 导出草图配置
  if (pathname === '/api/sketches-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = sketchesConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition':
        'attachment; filename="mySketchesAndNotesUiConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 导入草图配置
  if (pathname === '/api/sketches-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = sketchesConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = sketchesConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // ========== 命令别名配置 ==========

  // 获取命令别名配置
  if (pathname === '/api/quick-command' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = quickCommandConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 更新命令别名配置
  if (pathname === '/api/quick-command' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = quickCommandConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = quickCommandConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 重置命令别名配置为默认
  if (pathname === '/api/quick-command/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = quickCommandConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 导出命令别名配置
  if (pathname === '/api/quick-command/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const config = quickCommandConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myQuickCommand.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 导入命令别名配置
  if (pathname === '/api/quick-command/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return;

    const body = await parseBody(req);
    const errors = quickCommandConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return;
    }

    const config = quickCommandConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return;
  }

  // 404
  sendJson(res, 404, { error: '接口不存在' });
}

// ==================== HTTP 服务器 ====================

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const searchParams = url.searchParams; // 获取查询参数

  // 健康检查端点
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })
    );
    return;
  }

  // API 请求
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, searchParams);
    } catch (err) {
      log('error', `API 错误: ${err.message}`);
      sendJson(res, 500, { error: '服务器内部错误' });
    }
    return;
  }

  // 静态文件
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === '/' ? 'index.html' : pathname
  );

  // 如果 public 找不到 /brand/ 文件,回退到 frontend/dist
  if (!fs.existsSync(filePath) && pathname.startsWith('/brand/')) {
    filePath = path.join(FRONTEND_DIST_DIR, pathname);
  }

  // 安全检查：防止目录遍历
  if (
    !filePath.startsWith(PUBLIC_DIR) &&
    !filePath.startsWith(FRONTEND_DIST_DIR)
  ) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 读取文件
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    // 简单的 MIME 类型判断
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
});

// ==================== 启动服务 ====================

server.listen(PORT, () => {
  log('info', `部署配置中心已启动: http://localhost:${PORT}`);
  log('info', '使用 INITIAL_ADMIN_PASSWORD 进行管理员登录');
});

// 优雅关闭
process.on('SIGTERM', () => {
  log('info', '正在关闭服务...');
  server.close(() => {
    log('info', '服务已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', '正在关闭服务...');
  server.close(() => {
    log('info', '服务已关闭');
    process.exit(0);
  });
});
