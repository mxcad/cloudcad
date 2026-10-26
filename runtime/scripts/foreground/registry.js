/**
 * @fileoverview 前台进程生命周期注册表（A-1 机械拆分）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - setupSignalHandlers：cli.js:2630-2649
 * - cleanupForeground：cli.js:2651-2660
 *
 * childProcesses 经 lib/state 共享（A-2 收口时由 foreground/supervisor.js 内部持有，§4.2）。
 * 被 commands/start 引用。
 *
 * 前台退出语义（关终端 / Ctrl+C / SIGHUP）：同步杀应用层子进程 + 派生 detached
 * 清理进程跑全量 stop（foreground/cleanup.js → stopInfrastructure）+ 立即退出。
 * 全量停止在 detached 进程内完成（终端关闭后仍存活），CLI 只在 ~5s 强杀宽限内快速退出。
 *
 * Windows 关窗口的额外缺口：关闭控制台发的是 CTRL_CLOSE_EVENT，Node 不把它
 * 映射为任何 JS 信号，OS ~5s 后直接强杀 CLI，上面的信号处理器不会执行。由
 * armForegroundGuard 武装的哨兵兜底：心跳子进程（heartbeat.js，随控制台同亡）
 * 持续刷新存活文件；哨兵（sentinel.js，detached、关窗后存活）发现存活文件陈旧
 * 且无 clean 标记时派生 cleanup.js 跑全量停止。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { NODE_EXE, PROJECT_ROOT, DATA_DIR } = require('../lib/context');
const { log } = require('../lib/logger');
const { killTree } = require('../lib/proc');
const state = require('../lib/state');

/**
 * 同步终止全部前台子进程（信号处理器专用）。
 *
 * 与 cleanupForeground 不同：直接 killTree 整树强杀（无 SIGTERM + 200ms 兜底），
 * 因为信号处理器随后立即 process.exit，setTimeout 兜底不会被执行。
 * killTree 是同步的（Win: taskkill /T /F；Linux: kill(-pgid)），确保应用层在
 * CLI 退出前收到终止信号；残留由 detached 清理进程的进程表兜底再杀一次。
 * @returns {number} 实际发出终止信号的进程数
 */
function killChildProcessesSync() {
  const procs = Array.from(state.childProcesses).filter(
    (p) => p && !p.killed && p.pid
  );
  for (const proc of procs) {
    killTree(proc.pid, { silent: true });
  }
  state.childProcesses.clear();
  state.appProcesses.clear();
  return procs.length;
}

/**
 * 派生 detached、unref 的清理进程跑全量停止（foreground/cleanup.js）。
 *
 * 终端关闭时 CLI 只有 ~5s 宽限，慢的全量停止（pg_ctl 最长 45s）无法在 CLI 进程内
 * 完成。detached + windowsHide 使该进程不挂控制台、不随 CLI 退出而亡，终端关闭后
 * 仍在后台完成全量停止——「关终端 = 全停、目录可删」由此成立。
 * @returns {import('child_process').ChildProcess} 派生的清理进程
 */
function spawnDetachedCleanup() {
  const cleanupScript = path.join(__dirname, 'cleanup.js');
  const child = spawn(NODE_EXE, [cleanupScript], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child && typeof child.unref === 'function') {
    child.unref();
  }
  return child;
}

let cleanupStarted = false;

// 哨兵武装状态（null = 未武装）。armForegroundGuard 幂等：setupSignalHandlers
// 在前台路径被调用两次（startInfrastructure 前 + 应用层 spawn 后补武装），
// 心跳子进程与哨兵只拉一次。
let guard = null;

/**
 * 武装关窗哨兵（仅前台模式，由 setupSignalHandlers 调用）。
 *
 * 两个子进程：
 * - 心跳子进程（heartbeat.js）：**非 detached**、共享 CLI 控制台——Windows 关窗
 *   （CTRL_CLOSE_EVENT）/ Linux 关终端（SIGHUP）时随 CLI 一起被 OS 终止；每 2s
 *   刷新存活文件。独立进程保证 CLI 事件循环被 spawnSync 阻塞（pm2 引导、迁移）
 *   时文件仍新鲜，哨兵不误判。
 * - 哨兵（sentinel.js）：**detached + unref**（与 spawnDetachedCleanup 同参数）
 *   不挂控制台，关窗后存活；发现存活文件陈旧且无 clean 标记时派生 cleanup.js
 *   跑全量停止（见 sentinel.js 头部注释的完整时序）。
 *
 * CLI 正常退出（process.exit / 启动失败提前返回）时由 process.on('exit') 杀掉
 * 心跳子进程 → 存活文件停更 → 哨兵触发全量停止：没有前台驱动就没有服务。
 * 信号处理器退出路径则先写 clean 标记（markCleanExit），哨兵见标记静默退出
 * （全量停止已由 spawnDetachedCleanup 派生，不重复跑）。
 * @returns {{aliveFile:string,cleanFile:string}|null} 武装结果（失败返回 null）
 */
function armForegroundGuard() {
  if (guard) return guard;
  const token = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const aliveFile = path.join(DATA_DIR, `foreground-alive-${token}`);
  const cleanFile = path.join(DATA_DIR, `foreground-clean-${token}`);
  let heartbeat = null;
  let sentinel = null;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(aliveFile, String(Date.now()));
    heartbeat = spawn(
      NODE_EXE,
      [path.join(__dirname, 'heartbeat.js'), aliveFile, '2000'],
      { cwd: PROJECT_ROOT, stdio: 'ignore', windowsHide: true }
    );
    sentinel = spawn(
      NODE_EXE,
      [path.join(__dirname, 'sentinel.js'), aliveFile, cleanFile],
      {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
  } catch (err) {
    log(
      'yellow',
      `[警告] 前台哨兵拉起失败（关终端全停退化为仅信号处理器覆盖）: ${err.message}`
    );
    return null;
  }
  // spawn 异步失败（ENOENT 等）不致命：哨兵缺位时行为退回信号处理器覆盖
  if (heartbeat) heartbeat.on('error', () => {});
  if (sentinel) {
    sentinel.on('error', () => {});
    if (typeof sentinel.unref === 'function') sentinel.unref();
  }
  // CLI 正常退出（非信号路径）时杀掉心跳子进程，让哨兵及时触发全量停止
  process.on('exit', () => {
    if (heartbeat) {
      try {
        heartbeat.kill('SIGTERM');
      } catch {
        /* 已退出，忽略 */
      }
    }
  });
  guard = { aliveFile, cleanFile, heartbeat, sentinel };
  return guard;
}

/**
 * 写 clean 标记：CLI 已派生 cleanup.js 全量停止，哨兵见标记后静默退出。
 * 只在信号处理器路径调用；正常退出/崩溃路径不写（哨兵应触发全量停止）。
 */
function markCleanExit() {
  if (!guard || !guard.cleanFile) return;
  try {
    fs.writeFileSync(guard.cleanFile, String(Date.now()));
  } catch {
    /* 写失败时哨兵最多多跑一次幂等 stop，可接受 */
  }
}

/**
 * 创建前台退出清理函数（纯逻辑，不碰 process，便于测试）。
 *
 * 四步同步完成、~500ms 内退出 CLI（落在 Windows 关终端 ~5s 强杀宽限内）：
 * 1. 同步杀应用层子进程（killChildProcessesSync）；
 * 2. 派生 detached 清理进程跑全量 stop（spawnDetachedCleanup）；
 * 3. 写 clean 标记（markCleanExit），哨兵据此不重复停止；
 * 4. CLI 立即退出（process.exit(0)）。
 * cleanupStarted 防重入：多信号并发（如关终端同时触发 SIGTERM+SIGHUP）只执行一次。
 */
function createCleanupHandler() {
  return () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    console.log('\n');
    log('yellow', '[信号] 正在停止全部服务（前台退出，关闭终端即全停）...');
    killChildProcessesSync();
    spawnDetachedCleanup();
    markCleanExit();
    process.exit(0);
  };
}

/**
 * 注册前台退出信号处理器，并武装关窗哨兵（armForegroundGuard）。
 *
 * 信号处理器覆盖三类退出信号：
 * - SIGINT：Ctrl+C
 * - SIGTERM：kill / Windows 注销关机（注意：**关终端窗口**发的是
 *   CTRL_CLOSE_EVENT，Node 不映射为任何 JS 信号、OS ~5s 后直接强杀 CLI，
 *   该路径由哨兵（armForegroundGuard → sentinel.js）覆盖，不在此处）
 * - SIGHUP：Linux 关终端
 * 全部平台注册 SIGHUP（Linux 关终端即 SIGHUP，此前仅 Windows 注册是漏网）。
 */
function setupSignalHandlers() {
  cleanupStarted = false;
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGHUP');

  const cleanup = createCleanupHandler();
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
  armForegroundGuard();
  return cleanup;
}

/**
 * 终止所有前台子进程（P2.2 修复，供 stopInfrastructure 复用）。
 * - 先发 SIGTERM 让各 manager 优雅关停（PG/Redis/Cooperate 的 shutdown 处理器负责回收子进程）
 * - 200ms 后对仍存活的进程用 killTree 整树强杀（Win: taskkill /T /F；Linux: kill(-pgid)）
 */
function cleanupForeground() {
  const procs = Array.from(state.childProcesses).filter((p) => p && !p.killed);
  for (const proc of procs) {
    try {
      proc.kill('SIGTERM');
    } catch (e) {
      /* 忽略 */
    }
  }

  // 给各 manager 短暂优雅关停窗口，随后整树兜底强杀
  setTimeout(() => {
    for (const proc of Array.from(state.childProcesses)) {
      if (proc && !proc.killed && proc.pid) {
        killTree(proc.pid, { silent: true });
      }
    }
    state.childProcesses.clear();
    state.appProcesses.clear();
  }, 200);
}

module.exports = {
  setupSignalHandlers,
  cleanupForeground,
  killChildProcessesSync,
  spawnDetachedCleanup,
  createCleanupHandler,
  armForegroundGuard,
  markCleanExit,
};
