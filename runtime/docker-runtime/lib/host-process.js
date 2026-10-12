/**
 * @fileoverview 宿主进程管理（Docker 一键部署包，ADR-0074）
 *
 * 宿主进程 = 协同服务（mxcadAssembly，3091）/ conversion-service（3100）/
 * config-service 运维中心（3002）。本形态不用 PM2（容器重启由 dockerd 负责），
 * 统一走 nohup 语义：detached spawn（新进程组）+ pidfile + 日志文件。
 *
 * 与裸机形态（PM2）的关键差异与对齐点：
 * - 存活判定沿用 cooperate-manager.js 的**双判据**：pidfile 进程存活 且 端口可连，
 *   避免「端口被别的进程占着也被误报成功」的假成功。
 * - 停止走进程组：detached 子进程是进程组 leader，kill(-pid) 杀整组（含其 fork 的
 *   引擎子进程），SIGTERM → 5s → SIGKILL 升级。
 * - 日志轮转：nohup 重定向本身不轮转，这里按大小轮转（50MB × 3），
 *   防止 cooperate.log / dockerd.log 无限增长。
 *
 * 仅依赖 node 内置。
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const LOG_MAX_BYTES = 50 * 1024 * 1024; // 单文件 50MB
const LOG_KEEP = 3; // 保留 .1/.2 两份历史

/**
 * 按大小轮转日志文件：超过 LOG_MAX_BYTES 时 .2←.1←当前 依次后移。
 * @param {string} logFile 当前日志路径
 */
function rotateLog(logFile) {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size < LOG_MAX_BYTES) return;
  } catch {
    return; // 文件不存在无需轮转
  }
  for (let i = LOG_KEEP - 1; i >= 1; i--) {
    const from = i === 1 ? logFile : `${logFile}.${i - 1}`;
    const to = `${logFile}.${i}`;
    try {
      if (i > 1 && !fs.existsSync(from)) continue;
      fs.renameSync(from, to);
    } catch {
      // 轮转失败不阻塞启动（日志写满最坏情况是占盘，不是服务不可用）
    }
  }
  try {
    fs.writeFileSync(logFile, '');
  } catch {
    // 同上
  }
}

/**
 * 以 detached（新进程组）方式拉起宿主进程，stdout/stderr 追加到日志文件。
 *
 * @param {Object} opts
 * @param {string} opts.name 进程名（仅用于日志）
 * @param {string} opts.exe 可执行文件绝对路径
 * @param {string[]} [opts.args]
 * @param {string} [opts.cwd]
 * @param {Object} [opts.env] 追加到 process.env 的环境变量
 * @param {string} opts.logFile 日志文件绝对路径（先轮转再打开）
 * @param {string} opts.pidFile pidfile 绝对路径
 * @param {Function} [log] 日志函数
 * @returns {{ pid: number }}
 */
function startHostProcess({ name, exe, args = [], cwd, env = {}, logFile, pidFile, log = () => {} }) {
  rotateLog(logFile);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });

  const out = fs.openSync(logFile, 'a');
  const child = spawn(exe, args, {
    cwd: cwd || path.dirname(exe),
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
    detached: true, // 新进程组 leader：停止时 kill(-pid) 杀整组
  });
  child.unref();

  // spawn 的 'error'（如 ENOENT）不会同步抛出，须显式监听后落日志
  child.on('error', (err) => {
    log(`[host-process] ${name} 拉起失败: ${err.message}`);
  });

  const pid = child.pid;
  if (!pid) {
    throw new Error(`${name} 拉起失败：无 PID（可执行文件 ${exe} 是否存在/可执行？）`);
  }
  fs.writeFileSync(pidFile, String(pid));
  log(`[host-process] ${name} 已拉起（pid=${pid}，日志 ${logFile}）`);
  return { pid };
}

/** 读 pidfile；不存在或内容非法返回 null */
function readPid(pidFile) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** PID 是否存活（kill(pid, 0) 只探测不发送信号） */
function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = 进程存在但属主不同（sudo 场景），仍算存活
    return err.code === 'EPERM';
  }
}

/** TCP 端口探测（1s 超时） */
function portOpen(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

/**
 * 双判据存活判定（与 cooperate-manager.js 同语义）：pidfile 进程存活 且 端口可连。
 * @param {{ pidFile: string, port?: number }} opts
 * @returns {Promise<boolean>}
 */
async function isServiceRunning({ pidFile, port }) {
  const pid = readPid(pidFile);
  if (!isProcessAlive(pid)) return false;
  if (port && !(await portOpen(port))) return false;
  return true;
}

/**
 * 停止宿主进程：SIGTERM 整组 → 5s 未退则 SIGKILL 整组。
 * 任何失败都不抛错（stop.sh 语义：失败不阻塞后续步骤）。
 * @param {{ name: string, pidFile: string, log?: Function }} opts
 * @returns {Promise<'stopped'|'not-running'|'failed'>}
 */
async function stopHostProcess({ name, pidFile, log = () => {} }) {
  const pid = readPid(pidFile);
  if (!pid || !isProcessAlive(pid)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // 无 pidfile 也正常
    }
    return 'not-running';
  }

  const killGroup = (signal) => {
    try {
      process.kill(-pid, signal); // 进程组
      return true;
    } catch {
      try {
        process.kill(pid, signal); // 组已散时退化为杀单进程
        return true;
      } catch {
        return false;
      }
    }
  };

  killGroup('SIGTERM');
  const deadline = Date.now() + 5000;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (isProcessAlive(pid)) {
    log(`[host-process] ${name}（pid=${pid}）SIGTERM 5s 未退出，SIGKILL`);
    killGroup('SIGKILL');
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // 忽略
  }
  log(`[host-process] ${name} 已停止`);
  return isProcessAlive(pid) ? 'failed' : 'stopped';
}

module.exports = {
  rotateLog,
  startHostProcess,
  readPid,
  isProcessAlive,
  portOpen,
  isServiceRunning,
  stopHostProcess,
  LOG_MAX_BYTES,
  LOG_KEEP,
};
