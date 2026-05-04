/**
 * Redis 进程管理包装脚本
 * 
 * 用于 PM2 管理 Redis
 */

const { spawn, spawnSync } = require('child_process');
const net = require('net');
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
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const REDIS_DATA_DIR = path.join(DATA_DIR, 'redis');
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

// Redis 端口（从环境变量读取）
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

/**
 * 从 .env 文件加载 REDIS_PASSWORD 配置
 * @returns {string|null} Redis 密码，无密码返回 null
 */
function loadRedisPassword() {
  // 优先从环境变量读取
  if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim()) {
    return process.env.REDIS_PASSWORD.trim();
  }
  
  // 从 .env 文件读取
  if (fs.existsSync(BACKEND_ENV_PATH)) {
    try {
      const envContent = fs.readFileSync(BACKEND_ENV_PATH, 'utf-8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('REDIS_PASSWORD=')) {
          const value = trimmed.substring('REDIS_PASSWORD='.length).trim();
          // 移除可能的引号
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
          }
          return value || null;
        }
      }
    } catch (err) {
      // 读取失败，使用默认值
    }
  }
  
  return null;
}

// 可执行文件路径
const redisServer = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'redis', 'redis-server.exe')
      : path.join(PLATFORM_DIR, 'redis', 'redis-server'))
  : 'redis-server';

// Linux 下需要设置 LD_LIBRARY_PATH
const REDIS_LIB_DIR = USE_RUNTIME && !IS_WINDOWS
  ? path.join(PLATFORM_DIR, 'redis', 'lib')
  : null;

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

// 检查 Redis 是否已在运行
function isRunning() {
  return new Promise((resolve) => {
    const socket = net.connect(REDIS_PORT, 'localhost');
    let resolved = false;
    
    socket.on('connect', () => {
      if (!resolved) {
        resolved = true;
        socket.end();
        resolve(true);
      }
    });
    
    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    // 超时处理
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    }, 2000);
  });
}

// 启动 Redis
function startRedis() {
  return new Promise((resolve, reject) => {
    log('info', '启动 Redis...');
    
    // 加载 Redis 密码配置
    const redisPassword = loadRedisPassword();
    
    // 构建 Redis 启动参数
    const redisArgs = [
      '--port', String(REDIS_PORT),
      '--dir', REDIS_DATA_DIR,
      '--appendonly', 'yes'
    ];
    
    // 如果配置了密码，添加 requirepass 参数
    if (redisPassword) {
      redisArgs.push('--requirepass', redisPassword);
      log('info', '已配置 Redis 密码认证');
    } else {
      log('info', 'Redis 无密码模式');
    }
    
    const redisProcess = spawn(redisServer, redisArgs, {
      stdio: 'inherit',
      windowsHide: true,
      shell: IS_WINDOWS,
      detached: false,
      env: REDIS_LIB_DIR
        ? { ...process.env, LD_LIBRARY_PATH: `${REDIS_LIB_DIR}:${process.env.LD_LIBRARY_PATH || ''}` }
        : process.env
    });
    
    redisProcess.on('error', (err) => {
      log('error', `启动失败: ${err.message}`);
      reject(err);
    });
    
    // 给 Redis 一点时间启动，然后检查端口
    setTimeout(async () => {
      if (await isRunning()) {
        log('info', 'Redis 启动成功');
        resolve(redisProcess);
      } else {
        reject(new Error('Redis 启动超时'));
      }
    }, 2000);
    
    redisProcess.on('exit', (code, signal) => {
      if (signal) {
        log('info', `进程被信号 ${signal} 终止`);
      } else if (code !== 0) {
        log('error', `进程异常退出，退出码: ${code}`);
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
  });
}

async function main() {
  // 检查是否已在运行
  if (await isRunning()) {
    log('info', `Redis 已在运行（端口 ${REDIS_PORT}）`);
    log('info', '保持进程存活以维持 PM2 状态...');
    
    // 保持进程存活，定期检查状态
    const checkInterval = setInterval(async () => {
      if (!await isRunning()) {
        log('warn', 'Redis 进程已退出，尝试重启...');
        clearInterval(checkInterval);
        try {
          await startRedis();
          // 重启后重新设置检查
        } catch (err) {
          log('error', 'Redis 重启失败');
          process.exit(1);
        }
      }
    }, 5000);
    
    // 防止进程退出
    process.stdin.resume();
    return;
  }
  
  // 启动 Redis
  try {
    await startRedis();
  } catch (err) {
    process.exit(1);
  }
}

// 停止 Redis
async function stopRedis() {
  if (!await isRunning()) {
    log('info', 'Redis 未运行');
    return true;
  }
  
  log('info', '停止 Redis...');
  
  const redisCli = USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'redis', 'redis-cli.exe')
        : path.join(PLATFORM_DIR, 'redis', 'redis-cli'))
    : 'redis-cli';
  
  // 加载 Redis 密码配置
  const redisPassword = loadRedisPassword();
  
  // 构建 redis-cli 参数
  const cliArgs = [];
  if (redisPassword) {
    cliArgs.push('-a', redisPassword);
  }
  cliArgs.push('shutdown', 'nosave');
  
  const result = spawnSync(redisCli, cliArgs, {
    stdio: 'pipe',
    shell: IS_WINDOWS,
    timeout: 5000,
  });
  
  // 等待一下再检查
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (!await isRunning()) {
    log('info', 'Redis 已停止');
    return true;
  }
  
  log('warn', 'Redis 停止可能失败');
  return false;
}

// 命令行支持
const args = process.argv.slice(2);
const command = args[0];

if (command === 'status') {
  isRunning().then(running => {
    console.log(running ? 'running' : 'stopped');
    process.exit(running ? 0 : 1);
  });
} else if (command === 'stop') {
  stopRedis();
} else {
  main();
}
