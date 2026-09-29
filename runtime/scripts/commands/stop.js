/**
 * @fileoverview 停止服务命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:stopInfrastructure。
 * 依赖方向：commands → lib。被 commands/start、foreground/registry 引用。
 */

const fs = require('fs');
const path = require('path');

const { RUNTIME_DIR, NODE_EXE, PM2_JS, PORTS } = require('../lib/context');
const { log } = require('../lib/logger');
const { runCommand, runPm2, getPidByPort } = require('../lib/proc');
const { isPortOpen, waitPortReleased } = require('../lib/health');
const { stopRedisProcess } = require('../lib/redis-takeover');
const state = require('../lib/state');

/**
 * 只停止"应用层"（后端/前端），保留基础服务（PG/Redis/协同/配置中心）。
 * 用于切换启动模式（前台↔PM2、重复启动）以及**前台模式 Ctrl+C 退出**（Q0）时，
 * 避免误停 PM2 托管、常驻的基础服务。
 * - PM2 应用层：pm2 stop backend frontend（保留服务定义，便于后续 restart 复用）
 * - 前台应用层：kill state.appProcesses 中 spawn 的后端/前端进程
 */
async function stopAppServices() {
  // 1. 停 PM2 应用层（只 stop backend/frontend，保留定义、不碰基础服务 app）
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['stop', 'backend', 'frontend'], { silent: true });
  }

  // 2. 停前台应用层（state.appProcesses）
  const procs = Array.from(state.appProcesses).filter((p) => p && !p.killed);
  for (const proc of procs) {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* 忽略 */
    }
  }
  state.appProcesses.clear();

  log('cyan', '[✓] 已停止应用层服务（后端/前端），基础服务保留');
}

/**
 * 停止所有服务（基础服务 + 应用层）。
 *
 * 停止策略（ADR）：
 * - 基础服务统一由 PM2 托管，因此 `stop` 用 `pm2 stop all` **停止所有进程，
 *   但保留服务定义**（不 delete、不 kill daemon），便于后续 `pm2 start/restart` 复用。
 * - 前台 spawn 的兜底进程（cleanupForeground）一并清理。
 * - PG/Redis 若存在独立 manager 进程也做幂等智能关停（兜底，已停则跳过）。
 *
 * 极端残留场景请使用显式危险命令 `cloudcad.sh kill-all`。
 */
async function stopInfrastructure() {
  log('blue', '停止所有服务...');

  // 0. 停止前台模式（spawn 启动）的兜底子进程（cleanupForeground 全清）
  //    延迟 require 避免与 foreground/registry（它顶层 require 本模块）形成加载时循环依赖。
  const { cleanupForeground } = require('../foreground/registry');
  cleanupForeground();

  // 1. PM2 停止所有服务（基础服务 + 应用层），保留服务定义（不 delete）
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    log('cyan', '停止 PM2 托管的所有服务（保留服务定义）...');
    runPm2(['stop', 'all'], { silent: true });
  }

  // 2. 兜底：PG/Redis 智能关停（幂等，已在 PM2 停止后通常已停，此处确保无残留）
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  if (fs.existsSync(pgManagerScript)) {
    log('cyan', '停止 PostgreSQL...');
    runCommand(NODE_EXE, [pgManagerScript, 'stop'], { silent: true });
  }
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );
  if (fs.existsSync(redisManagerScript)) {
    log('cyan', '停止 Redis...');
    runCommand(NODE_EXE, [redisManagerScript, 'stop'], { silent: true });
    // 兜底校验：redis-manager stop 内部已有强杀回退，这里守最后一道门——
    // 端口上若是另一部署目录/人工实例（密码与本目录 .env 不一致，shutdown 被
    // NOAUTH 拒绝），必须按 PID 强杀，否则"停止"只是假象，下次 start 采纳
    // 残留实例后端恒连接失败。
    if (!(await waitPortReleased(PORTS.redis, 12000))) {
      const pid = getPidByPort(PORTS.redis);
      if (pid) {
        log('yellow', `  redis 仍有残留实例 (PID ${pid})，强制停止...`);
        stopRedisProcess(pid);
        await waitPortReleased(PORTS.redis, 10000);
      }
    }
    if (await isPortOpen(PORTS.redis)) {
      log(
        'red',
        `  [错误] Redis 端口 ${PORTS.redis} 仍被占用，停止未完成。请手动确认占用进程（netstat -ano | findstr :${PORTS.redis}）。`
      );
    } else {
      log('cyan', '  Redis 已停止，端口已释放');
    }
  }

  log('green', '[✓] 所有服务已停止（PM2 服务定义已保留，可随时重新启动）');
}

/**
 * 显式危险命令：按进程名全杀（P8 兜底替代品）。
 * 只在 `cloudcad.sh kill-all` 显式调用，日常 stop 不再触发，
 * 避免误杀同机其他 node 进程或 CLI 自身（P2.3）。
 */
async function killAllInfrastructure() {
  log('yellow', '>>> 危险操作：按进程名强制结束所有相关进程');
  log('yellow', '    该操作会结束同机上匹配的 node/postgres/redis/mxcadassembly 进程');
  log('yellow', '    请确认没有其他服务依赖这些进程。');

  const { IS_WINDOWS } = require('../lib/context');
  const { spawnSync } = require('child_process');

  const processNames = IS_WINDOWS
    ? [
        { exe: 'postgres.exe', name: 'PostgreSQL' },
        { exe: 'redis-server.exe', name: 'Redis' },
        { exe: 'mxcadassembly.exe', name: 'Cooperate' },
        { exe: 'node.exe', name: 'Node.js' },
      ]
    : [
        { name: 'PostgreSQL', match: 'postgres' },
        { name: 'Redis', match: 'redis-server' },
        { name: 'Cooperate', match: 'mxcadassembly' },
        { name: 'Node.js', match: 'node' },
      ];

  for (const proc of processNames) {
    if (IS_WINDOWS) {
      const result = spawnSync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${proc.exe}`, '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', shell: true }
      );
      for (const line of result.stdout.split('\n').filter((l) => l.includes(proc.exe))) {
        const match = line.match(/"([^"]+)"/g);
        if (match && match.length >= 2) {
          const pid = match[1].replace(/"/g, '');
          if (pid && pid !== 'PID') {
            log('cyan', `结束 ${proc.name} (PID: ${pid})...`);
            spawnSync('taskkill', ['/F', '/PID', pid], {
              shell: true,
              stdio: 'pipe',
            });
          }
        }
      }
    } else {
      log('cyan', `结束 ${proc.name} 进程...`);
      spawnSync('pkill', ['-f', proc.match], { stdio: 'pipe' });
    }
  }

  log('green', '[✓] 已执行 kill-all');
}

module.exports = {
  stopInfrastructure,
  stopAppServices,
  killAllInfrastructure,
};
