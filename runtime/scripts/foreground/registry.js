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
 */

const path = require('path');
const { spawn } = require('child_process');
const { NODE_EXE, PROJECT_ROOT } = require('../lib/context');
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

/**
 * 创建前台退出清理函数（纯逻辑，不碰 process，便于测试）。
 *
 * 三步同步完成、~500ms 内退出 CLI（落在 Windows 关终端 ~5s 强杀宽限内）：
 * 1. 同步杀应用层子进程（killChildProcessesSync）；
 * 2. 派生 detached 清理进程跑全量 stop（spawnDetachedCleanup）；
 * 3. CLI 立即退出（process.exit(0)）。
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
    process.exit(0);
  };
}

/**
 * 注册前台退出信号处理器。
 *
 * 覆盖三类退出信号：
 * - SIGINT：Ctrl+C
 * - SIGTERM：Windows 关终端（CTRL_CLOSE_EVENT）、kill
 * - SIGHUP：Linux 关终端、Windows 注销/关机
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
};
