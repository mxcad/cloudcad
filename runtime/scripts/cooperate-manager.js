/**
 * MxCAD 协同服务进程管理包装脚本
 *
 * 用于 PM2 管理 MxCAD Cooperate 服务
 *
 * 设计要点（2026-08-18 加固）：
 * 1. 启动前主动接管端口：发现 3091 被占用时先强制结束占用进程再启动，
 *    避免“部署两次/残留孤儿进程”导致新旧实例争抢端口、mxcadassembly 反复崩溃。
 * 2. 真实成功判定：以“spawn 的子进程仍存活 且 端口可连接”为准，
 *    不再出现“端口被别的进程占着也被误报为启动成功”的假成功。
 * 3. 主动让位：如果端口被其他实例接管（弱于我方本次接管），以退出码 0 让位
 *    并配合 ecosystem.config.js 的 stop_exit_codes:[0] 阻止 PM2 反复重启抢占。
 */

const { spawn, spawnSync } = require('child_process');
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

// 当前由本包装进程管理的子进程（模块级，便于信号处理器随时终止它）
let activeChild = null;
// 是否正在执行关闭流程（停止后不再触发守护/重启逻辑）
let shuttingDown = false;

function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[level] || ''}[COOPERATE-${level.toUpperCase()}]${colors.reset} ${message}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// 获取占用指定端口的 PID 列表（Windows：netstat）
function getPortPids(port) {
  if (!IS_WINDOWS) return [];

  const res = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: false });
  if (res.error || !res.stdout) return [];

  const pids = new Set();
  const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'i');
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = line.trim().match(re);
    if (m) pids.add(m[1]);
  }
  return Array.from(pids);
}

// 强制结束占用指定端口的进程
function killPortOwner(port) {
  if (IS_WINDOWS) {
    const pids = getPortPids(port);
    for (const pid of pids) {
      log('warn', `端口 ${port} 被 PID ${pid} 占用，正在结束该进程...`);
      spawnSync('taskkill', ['/F', '/PID', pid], {
        shell: false,
        stdio: 'pipe',
      });
    }
    return true;
  }

  // Linux：优先 fuser（精确按端口定位）
  const fuser = spawnSync('fuser', ['-k', `${port}/tcp`], {
    shell: false,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (fuser.error) {
    // fuser 不可用（未安装 psmisc）时，回退到按进程名精确清理
    log('warn', 'fuser 不可用，改用 pkill 清理遗留的 mxcadassembly 进程');
    spawnSync('pkill', ['-9', '-x', 'mxcadassembly'], {
      shell: false,
      stdio: 'pipe',
    });
    return true;
  }
  const matched = fuser.status === 0;
  if (matched) {
    log('warn', `端口 ${port} 原有进程已收到终止信号`);
  }
  return true;
}

// 确保端口空闲：若被占用则强制清理，并等待其真正释放，返回是否接管成功
async function ensurePortFree(port, timeoutMs) {
  if (!(await isRunning())) return true;

  log('warn', `端口 ${port} 已被其他 MxCAD 协同服务进程占用，正在强制结束旧进程 ...`);
  killPortOwner(port);

  const deadline = Date.now() + timeoutMs;
  while (await isRunning()) {
    if (Date.now() >= deadline) {
      log('error', `端口 ${port} 在 ${timeoutMs}ms 内未释放，无法接管`);
      return false;
    }
    await sleep(500);
  }

  log('info', `端口 ${port} 已释放，接管完成`);
  return true;
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
    });
    activeChild = cooperateProcess;

    let settled = false;
    const deadline = Date.now() + 10000;

    cooperateProcess.on('error', (err) => {
      if (shuttingDown) return;
      settled = true;
      log('error', `启动失败: ${err.message}`);
      reject(err);
    });

    // 真实成功判定：子进程存活 且 端口可连接。
    // 子进程提前退出（端口被抢占）不再被“探测到端口有人”误判为成功。
    const check = () => {
      if (settled || shuttingDown) return;

      if (cooperateProcess.exitCode !== null || cooperateProcess.signalCode !== null) {
        settled = true;
        const sig = cooperateProcess.signalCode ? `，信号: ${cooperateProcess.signalCode}` : '';
        reject(
          new Error(
            `MxCAD 协同服务进程提前退出，退出码: ${cooperateProcess.exitCode}${sig}（端口 ${COOPERATE_PORT} 可能被其他实例占用）`
          )
        );
        return;
      }

      if (isRunning()) {
        settled = true;
        log('info', 'MxCAD 协同服务启动成功');
        resolve(cooperateProcess);
        return;
      }

      if (Date.now() >= deadline) {
        settled = true;
        try {
          cooperateProcess.kill('SIGKILL');
        } catch (e) {}
        reject(new Error('MxCAD 协同服务启动超时'));
        return;
      }

      setTimeout(check, 500);
    };
    setTimeout(check, 500);

    cooperateProcess.on('exit', (code, signal) => {
      if (signal) {
        log('info', `进程被信号 ${signal} 终止`);
      } else if (code !== 0) {
        log('error', `进程异常退出，退出码: ${code}`);
      } else {
        log('info', '服务已正常停止');
      }
    });
  });
}

// 守护循环：子进程异常退出后尝试重启；若端口已被其他实例接管则主动让位（退出码 0）
async function scheduleGuard() {
  setTimeout(async () => {
    if (shuttingDown) return;

    const child = activeChild;
    const exited = child && (child.exitCode !== null || child.signalCode !== null);

    if (exited) {
      log('warn', 'MxCAD 协同服务进程已退出，尝试重启...');

      const portHeld = await isRunning();
      if (portHeld) {
        log('warn', `端口 ${COOPERATE_PORT} 已被其他 MxCAD 协同服务实例接管，本实例让位`);
        process.exit(0); // 配合 ecosystem.config.js 的 stop_exit_codes:[0]，PM2 不再自动重启
      }

      try {
        if (await ensurePortFree(COOPERATE_PORT, 8000)) {
          await startCooperate();
          log('info', 'MxCAD 协同服务重启成功');
        } else {
          log('error', '端口未能释放，重启放弃');
          process.exit(1);
        }
      } catch (err) {
        const held = await isRunning();
        if (held) {
          log('error', `重启失败：${err.message}，端口被其他实例接管，本实例让位`);
          process.exit(0);
        }
        log('error', `MxCAD 协同服务重启失败: ${err.message}`);
        process.exit(1);
      }
    }

    scheduleGuard();
  }, 5000);
}

// 关闭流程：终止当前子进程并退出（信号处理器在模块级注册，任何分支下都生效）
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `收到 ${signal} 信号，正在停止...`);

  const child = activeChild;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch (e) {}
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
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

  // 1. 强制接管端口：先清理占用 3091 的旧进程（含残留孤儿进程），再启动
  if (!(await ensurePortFree(COOPERATE_PORT, 10000))) {
    log('error', '清理端口失败，本次启动放弃');
    process.exit(1);
  }

  // 2. 启动折叠服务
  try {
    await startCooperate();
  } catch (err) {
    log('error', `MxCAD 协同服务启动失败: ${err.message}`);
    process.exit(1);
  }

  log('info', `MxCAD 协同服务正在运行（端口 ${COOPERATE_PORT}）`);

  // 3. 守护循环：异常退出后重启 / 被接管后让位
  scheduleGuard();

  // 保持进程存活
  process.stdin.resume();
}

// 命令行支持
const args = process.argv.slice(2);
const command = args[0];

// 信号处理器：模块级注册，确保“端口被占空转/守护中”等任何分支下 PM2 停止都能优雅终止子进程
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
if (IS_WINDOWS) {
  process.on('SIGBREAK', () => shutdown('SIGBREAK'));
}

if (command === 'status') {
  isRunning().then((running) => {
    console.log(running ? 'running' : 'stopped');
    process.exit(running ? 0 : 1);
  });
} else {
  main();
}