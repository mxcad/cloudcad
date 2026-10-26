/**
 * @fileoverview 前台关窗哨兵（detached 进程入口）
 *
 * 补上「关终端 = 全停」的最后一块缺口：Windows 关闭控制台窗口发的是
 * CTRL_CLOSE_EVENT，Node 不把它映射为任何 JS 信号（winconsole 只处理
 * CTRL_C→SIGINT / CTRL_BREAK→SIGBREAK / 注销关机→SIGTERM），OS 在 ~5s 宽限后
 * 直接强杀 CLI，信号处理器（foreground/registry.js）没有机会执行。本哨兵由 CLI
 * 以 detached + unref 拉起（与 spawnDetachedCleanup 同参数）：不挂控制台，
 * 关窗后仍存活。
 *
 * 判定（每 1s 轮询存活文件 mtime，文件由心跳子进程 heartbeat.js 刷新）：
 * - 新鲜（≤8s）→ CLI（前台驱动）还活着，继续等待；
 * - 陈旧（CLI + 心跳子进程都已死亡）时按序判定：
 *   1. clean 标记文件存在 → CLI 已走信号处理器派生过 cleanup.js 全量停止
 *      → 静默退出（不重复停）；
 *   2. 本目录有另一个前台**驱动**进程在跑（复用 stop.js 的
 *      listOurDriverProcesses：只认 `cli.js deploy|start` 驱动，不认
 *      config-service 等应用层残留——旧实例驱动死后残留仍在进程表，按应用层
 *      判据会误判「有另一实例」而静默退出、服务全部留活，真机 E2E 实测暴露）
 *      → 静默退出，残留由新实例的端口归属门禁处理（避免与用户快速重试
 *      start 竞态）；
 *   3. 否则 → 派生既有 cleanup.js（detached，跑全量 stopInfrastructure，日志落
 *      data/logs/deploy/foreground-cleanup-*.log）后退出。
 *
 * 时序：关窗 → CLI/心跳子进程 ~5s 被强杀 → 哨兵 ~8-13s 检测到 → 全量停止
 * 10-45s → 关窗后约 15~60s 目录可删。
 *
 * 用法：node sentinel.js <aliveFile> <cleanFile>
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const aliveFile = process.argv[2];
const cleanFile = process.argv[3];
const CLEANUP_JS = path.join(__dirname, 'cleanup.js');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// 心跳 2s 一次，连续 4 次缺失判陈旧（容忍单次事件循环抖动）
const STALE_MS = 8000;
const POLL_MS = 1000;

/**
 * 纯判定函数（单测锁定判定矩阵，不碰 fs/进程）。
 * @param {{stale:boolean, cleanFlag:boolean, otherInstanceActive:boolean}} obs
 * @returns {'wait'|'exit'|'stop'} wait=继续轮询；exit=静默退出；stop=派生 cleanup.js
 */
function decide({ stale, cleanFlag, otherInstanceActive }) {
  if (!stale) return 'wait';
  if (cleanFlag) return 'exit';
  if (otherInstanceActive) return 'exit';
  return 'stop';
}

function isStale() {
  try {
    return Date.now() - fs.statSync(aliveFile).mtimeMs > STALE_MS;
  } catch {
    // 文件缺失（写入失败 / 已被清理）= 按已死处理，方向安全
    return true;
  }
}

/**
 * 本目录是否有另一个前台实例（驱动进程）在跑。查询失败按「没有」处理
 * （fail 向停止：多跑一次幂等的 stop 好过漏停留残留）。
 *
 * 只认驱动进程（cli.js deploy|start），不认 config-service 等应用层残留：
 * 旧实例驱动死后那些残留仍在进程表里，按应用层判据会误判「有另一实例」而
 * 静默退出、服务全部留活（真机 E2E 实测暴露）。
 */
function anotherInstanceActive() {
  try {
    const { listOurDriverProcesses } = require('../commands/stop');
    return listOurDriverProcesses().length > 0;
  } catch {
    return false;
  }
}

function finish(code) {
  for (const f of [aliveFile, cleanFile]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* 文件已不在，忽略 */
    }
  }
  process.exit(code);
}

if (!aliveFile || !cleanFile) {
  process.exit(1);
}

setInterval(() => {
  const action = decide({
    stale: isStale(),
    cleanFlag: fs.existsSync(cleanFile),
    otherInstanceActive: anotherInstanceActive(),
  });
  if (action === 'wait') return;
  if (action === 'exit') {
    finish(0);
    return;
  }
  const child = spawn(process.execPath, [CLEANUP_JS], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child && typeof child.unref === 'function') child.unref();
  finish(0);
}, POLL_MS);

module.exports = { decide };
