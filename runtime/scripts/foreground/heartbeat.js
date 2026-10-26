/**
 * @fileoverview 前台心跳子进程（关窗哨兵组件，见 sentinel.js）
 *
 * 由 CLI（foreground/registry.js 的 armForegroundGuard）以**非 detached** 方式
 * 拉起（共享 CLI 的控制台）：
 * - Windows 关窗口时 CTRL_CLOSE_EVENT 发给所有挂该控制台的进程，本进程随 CLI
 *   一起被 OS 强杀（Node 不把 CTRL_CLOSE_EVENT 映射为任何 JS 信号，CLI 的信号
 *   处理器不会执行）；
 * - Linux 关终端时 SIGHUP 发给进程组，本进程同样随 CLI 退出。
 *
 * 职责只有一件：每 intervalMs 刷新一次 CLI 写好的「存活文件」mtime。独立进程的
 * 意义：CLI 事件循环被 spawnSync 阻塞时（pm2 引导、数据库迁移等），文件仍保持
 * 新鲜，哨兵不会误判「CLI 已死」。
 *
 * CLI 正常退出（如启动失败提前返回）时由 CLI 的 process.on('exit') 处理器杀掉
 * 本进程；存活文件停更后哨兵触发全量停止——语义：没有前台驱动就没有服务。
 *
 * 用法：node heartbeat.js <aliveFile> [intervalMs=2000]
 */

const fs = require('fs');

const aliveFile = process.argv[2];
const intervalMs =
  Math.max(500, parseInt(process.argv[3] || '2000', 10) || 2000);

if (!aliveFile) {
  process.exit(1);
}

function beat() {
  try {
    fs.writeFileSync(aliveFile, String(Date.now()));
  } catch {
    /* 文件丢失（如目录被删）时停止刷新，哨兵按「文件缺失 = 已死」判定 */
  }
}

beat();
setInterval(beat, intervalMs);
