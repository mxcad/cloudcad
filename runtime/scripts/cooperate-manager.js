/**
 * MxCAD 协同服务进程管理包装脚本
 * 
 * 用于 PM2 管理 MxCAD Cooperate 服务
 */

const { spawn } = require('child_process');
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

function main() {
  if (!mxcadAssembly || !fs.existsSync(mxcadAssembly)) {
    log('error', 'mxcadassembly 不存在');
    log('info', `路径: ${mxcadAssembly || '未配置'}`);
    process.exit(1);
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
      LD_LIBRARY_PATH: IS_LINUX
        ? `${path.join(path.dirname(mxcadAssembly), 'mx', 'so')}:${process.env.LD_LIBRARY_PATH || ''}`
        : undefined,
    },
  });
  
  cooperateProcess.on('error', (err) => {
    log('error', `启动失败: ${err.message}`);
    process.exit(1);
  });
  
  cooperateProcess.on('exit', (code, signal) => {
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
}

main();
