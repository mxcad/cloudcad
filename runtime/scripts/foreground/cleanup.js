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
 * 按进程表兜住）。
 *
 * 本进程 stdio 全为 'ignore'（detached 且不挂控制台），控制台输出无处可见。
 * 此前「停不干净」只剩一个退出码、完全静默，关终端后无从排查；故借
 * lib/deploy-log 把全过程同步镜像到 data/logs/deploy/
 * （foreground-cleanup-<时间戳>.log，与部署日志同目录、日志中心一并打包）。
 * 成败仍由退出码体现（0=已停干净、1=仍有残留）。
 */

const { stopInfrastructure } = require('../commands/stop');
const { startDeployLog } = require('../lib/deploy-log');

async function main() {
  const stopLog = startDeployLog('foreground-cleanup');
  try {
    const ok = await stopInfrastructure();
    console.log(
      ok
        ? '[foreground-cleanup] 全量停止完成，本目录文件已释放，可直接删除部署包'
        : '[foreground-cleanup] 全量停止未完全成功（仍有残留），请勿删除部署包，可用 kill-all 兜底或重启机器'
    );
    stopLog();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    // 镜像仍开着：异常同样落盘（此前 stdio 全忽略，异常完全静默）
    console.error(
      `[foreground-cleanup] 全量停止异常：${err && err.stack ? err.stack : err}`
    );
    try {
      stopLog();
    } catch {
      /* 停止镜像失败不影响退出码 */
    }
    process.exit(1);
  }
}

main();
