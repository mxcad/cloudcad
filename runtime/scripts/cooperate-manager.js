/**
 * MxCAD 协同服务进程管理包装脚本
 * 
 * 用于 PM2 管理 MxCAD Cooperate 服务
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);

// Cooperate 服务端口
const COOPERATE_PORT = 3091;

// 可执行文件路径
const mxcadAssembly = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly.exe')
      : path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly'))
  : null;

function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level] || ''}[COOPERATE-${level.toUpperCase()}]${colors.reset} ${message}`);
}

// 检查 Cooperate 服务是否已在运行
function isRunning() {
  return new Promise((resolve) => {
    const socket = net.connect(COOPERATE_PORT, 'localhost');
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

// 启动 Cooperate 服务
function startCooperate() {
  return new Promise((resolve, reject) => {
    if (!mxcadAssembly || !fs.existsSync(mxcadAssembly)) {
      log('error', 'mxcadassembly 不存在');
      log('info', `路径: ${mxcadAssembly || '未配置'}`);
      reject(new Error('mxcadassembly not found'));
      return;
    }
    
    log('info', '启动 MxCAD 协同服务...');
    log('info', `可执行文件: ${mxcadAssembly}`);
    
    const cooperateArgs = JSON.stringify({
      run_cooperate_server: true,
      print_server: true,
    });
    
    const cooperateProcess = spawn(mxcadAssembly, [cooperateArgs], {
      stdio: 'inherit',
      windowsHide: true,
      shell: IS_WINDOWS,
      cwd: path.dirname(mxcadAssembly),
      env: {
        ...process.env,
        // 不设置 LD_LIBRARY_PATH，让 mxcad 使用系统 glibc
        // LD_LIBRARY_PATH: IS_LINUX
        //   ? `${path.join(path.dirname(mxcadAssembly), 'mx', 'so')}:${process.env.LD_LIBRARY_PATH || ''}`
        //   : undefined,
      },
    });
    
    cooperateProcess.on('error', (err) => {
      log('error', `启动失败: ${err.message}`);
      reject(err);
    });
    
    // 给服务一点时间启动，然后检查端口
    setTimeout(async () => {
      if (await isRunning()) {
        log('info', 'MxCAD 协同服务启动成功');
        resolve(cooperateProcess);
      } else {
        reject(new Error('MxCAD 协同服务启动超时'));
      }
    }, 3000);
    
    cooperateProcess.on('exit', (code, signal) => {
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
      cooperateProcess.kill('SIGTERM');
      setTimeout(() => {
        cooperateProcess.kill('SIGKILL');
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
  // 检查 mxcadAssembly 是否可用
  if (!mxcadAssembly || !fs.existsSync(mxcadAssembly)) {
    log('warn', 'mxcadassembly 不存在，协同服务将不可用');
    log('info', `路径: ${mxcadAssembly || '未配置'}`);
    // 保持进程存活，让 PM2 认为服务正常
    process.stdin.resume();
    return;
  }
  
  // 检查是否已在运行
  if (await isRunning()) {
    log('info', `MxCAD 协同服务已在运行（端口 ${COOPERATE_PORT}）`);
    log('info', '保持进程存活以维持 PM2 状态...');
    
    // 保持进程存活，定期检查状态
    const checkInterval = setInterval(async () => {
      if (!await isRunning()) {
        log('warn', 'MxCAD 协同服务进程已退出，尝试重启...');
        clearInterval(checkInterval);
        try {
          await startCooperate();
        } catch (err) {
          log('error', 'MxCAD 协同服务重启失败');
          process.exit(1);
        }
      }
    }, 5000);
    
    // 防止进程退出
    process.stdin.resume();
    return;
  }
  
  // 启动 Cooperate 服务
  try {
    await startCooperate();
  } catch (err) {
    process.exit(1);
  }
}

// 命令行支持
const args = process.argv.slice(2);
const command = args[0];

if (command === 'status') {
  isRunning().then(running => {
    console.log(running ? 'running' : 'stopped');
    process.exit(running ? 0 : 1);
  });
} else {
  main();
}
