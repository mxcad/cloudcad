/**
 * Redis 进程管理包装脚本
 * 
 * 用于 PM2 管理 Redis
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'offline-data');
const REDIS_DATA_DIR = path.join(DATA_DIR, 'redis');

// 可执行文件路径
const redisServer = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'redis', 'redis-server.exe')
      : path.join(PLATFORM_DIR, 'redis', 'redis-server'))
  : 'redis-server';

// 确保目录存在
if (!fs.existsSync(REDIS_DATA_DIR)) {
  fs.mkdirSync(REDIS_DATA_DIR, { recursive: true });
}

function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level] || ''}[REDIS-${level.toUpperCase()}]${colors.reset} ${message}`);
}

function main() {
  log('info', '启动 Redis...');
  
  const redisProcess = spawn(redisServer, [
    '--port', '6379',
    '--dir', REDIS_DATA_DIR,
    '--appendonly', 'yes'
  ], {
    stdio: 'inherit',
    windowsHide: true,
    shell: IS_WINDOWS,
    detached: false
  });
  
  redisProcess.on('error', (err) => {
    log('error', `启动失败: ${err.message}`);
    process.exit(1);
  });
  
  redisProcess.on('exit', (code, signal) => {
    if (signal) {
      log('info', `进程被信号 ${signal} 终止`);
    } else if (code !== 0) {
      log('error', `进程异常退出，退出码: ${code}`);
      process.exit(code || 1);
    } else {
      log('info', '服务已正常停止');
    }
  });
  
  // 优雅退出
  const shutdown = (signal) => {
    log('info', `收到 ${signal} 信号，正在停止...`);
    redisProcess.kill('SIGTERM');
    setTimeout(() => {
      redisProcess.kill('SIGKILL');
      process.exit(0);
    }, 5000);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  if (IS_WINDOWS) {
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }
}

main();
