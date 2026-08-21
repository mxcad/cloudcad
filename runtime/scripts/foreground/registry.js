/**
 * @fileoverview 前台进程生命周期注册表（A-1 机械拆分）
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js：
 * - setupSignalHandlers：cli.js:2630-2649
 * - cleanupForeground：cli.js:2651-2660
 *
 * childProcesses 经 lib/state 共享（A-2 收口时由 foreground/supervisor.js 内部持有，§4.2）。
 * 被 commands/start 引用。依赖 commands/stop（信号清理时停止基础设施）。
 */

const { IS_WINDOWS } = require('../lib/context');
const { log } = require('../lib/logger');
const { killTree } = require('../lib/proc');
const state = require('../lib/state');
const { stopAppServices } = require('../commands/stop');

function setupSignalHandlers() {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGHUP');

  const cleanup = async () => {
    console.log('\n');
    // Q0 理顺：前台模式 Ctrl+C 只停"应用层"（backend/frontend 前台 spawn），
    // 基础服务（PG/Redis/协同/配置中心）由 PM2 托管，保持常驻，不随前台退出。
    // 手动停止全部服务请用 `cloudcad.sh stop`（stopInfrastructure）。
    log('yellow', '[信号] 正在停止应用层服务（基础服务保持常驻）...');
    cleanupForeground();
    await stopAppServices();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (IS_WINDOWS) {
    process.on('SIGHUP', cleanup);
  }
}

/**
 * 终止所有前台子进程（P2.2 修复）。
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
};
