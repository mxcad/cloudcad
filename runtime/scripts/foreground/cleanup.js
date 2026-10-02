/**
 * @fileoverview 前台退出全量停止（detached 进程入口）
 *
 * 前台模式关闭终端 / Ctrl+C 时，CLI 进程在 Windows 上只有 ~5s 宽限即被 OS 强杀
 * （CTRL_CLOSE_EVENT），慢的全量停止（pg_ctl 最长 45s、redis SHUTDOWN SAVE、
 * 进程表扫描）无法在 CLI 进程内完成。故由信号处理器（foreground/registry.js）
 * 派生本脚本为 detached、unref 进程：不挂控制台（windowsHide + detached），
 * 终端关闭后仍存活，在后台完成全量停止——「关终端 = 全停、目录可删」由此成立。
 *
 * 走 stopInfrastructure 的目录归属清理（进程表判据），不依赖 CLI 进程的内存
 * 状态（state.childProcesses 在本进程为空，应用层残留由 stopAppLayerProcesses
 * 按进程表兜住）。本进程无控制台，日志静默丢弃；成败由退出码体现（0=已停干净、
 * 1=仍有残留），排查时手动跑 `stop` 可见完整输出。
 */

const { stopInfrastructure } = require('../commands/stop');

async function main() {
  const ok = await stopInfrastructure();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  try {
    console.error('[foreground-cleanup] 全量停止失败:', err);
  } catch {
    /* detached 进程无控制台，输出失败时静默 */
  }
  process.exit(1);
});
