/**
 * foreground/registry.js 前台退出语义回归测试（node:test，0 外部依赖）
 *
 * 锁定「关终端 = 全停」的核心行为：
 * - killChildProcessesSync：同步 killTree 全量子进程（无 setTimeout——process.exit 会取消定时器）
 * - spawnDetachedCleanup：detached + unref 派生 cleanup.js（终端关闭后仍存活跑全量 stop）
 * - createCleanupHandler：同步杀应用层 + 派生 detached + exit(0)，防重入
 * - setupSignalHandlers：SIGHUP 全平台注册（Linux 关终端 = SIGHUP，此前仅 Windows 注册是漏网）
 *
 * 运行：node --test runtime/scripts/foreground/registry.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { NODE_EXE, PROJECT_ROOT } = require('../lib/context');
const state = require('../lib/state');

const CLEANUP_JS = path.join(__dirname, 'cleanup.js');

/**
 * 以给定的 mock 重新加载 registry.js。
 *
 * registry.js 顶层用解构从 child_process 取 spawn、从 lib/proc 取 killTree
 * （加载时即固定函数引用），故必须在 require registry.js 之前替换导出、
 * 并清掉 registry.js 的模块缓存。
 *
 * 注意：process.exit 在 cleanup handler 里是**直接调用**（非加载时捕获），
 * 无法在此处 mock——由具体测试在调用 handler 前后临时替换。
 */
function loadRegistry({ spawnMock, killTreeMock } = {}) {
  const childProcess = require('child_process');
  const prevSpawn = childProcess.spawn;
  if (spawnMock) childProcess.spawn = spawnMock;

  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const prevKillTree = proc.killTree;
  if (killTreeMock) proc.killTree = killTreeMock;

  const registryPath = require.resolve('./registry');
  delete require.cache[registryPath];
  const loaded = require('./registry');

  // 恢复（registry.js 已捕获 mock 引用，恢复不影响其内部行为）
  childProcess.spawn = prevSpawn;
  proc.killTree = prevKillTree;

  return loaded;
}

/** 清空前台进程表（共享 state，测试间隔离）。 */
function clearState() {
  state.childProcesses.clear();
  state.appProcesses.clear();
}

/** 造一个存活子进程对象。 */
function fakeProc(pid) {
  return { pid, killed: false, exitCode: null };
}

test('killChildProcessesSync：同步 killTree 全量子进程并清空 Set', () => {
  clearState();
  const killCalls = [];
  const p1 = fakeProc(101);
  const p2 = fakeProc(202);
  state.childProcesses.add(p1);
  state.childProcesses.add(p2);
  state.appProcesses.add(p1);

  const { killChildProcessesSync } = loadRegistry({
    killTreeMock: (pid, opts) => {
      killCalls.push({ pid, opts });
      return true;
    },
  });

  const count = killChildProcessesSync();
  assert.equal(count, 2);
  assert.deepEqual(killCalls.map((c) => c.pid).sort(), [101, 202]);
  // 全部 silent（信号处理器里不刷屏）
  assert.ok(killCalls.every((c) => c.opts && c.opts.silent === true));
  // 两个 Set 都清空
  assert.equal(state.childProcesses.size, 0);
  assert.equal(state.appProcesses.size, 0);
});

test('killChildProcessesSync：已 killed / 无 pid 的子进程不重复杀', () => {
  clearState();
  const killCalls = [];
  const alive = fakeProc(303);
  const killed = { pid: 404, killed: true, exitCode: null };
  const noPid = { pid: null, killed: false, exitCode: null };
  state.childProcesses.add(alive);
  state.childProcesses.add(killed);
  state.childProcesses.add(noPid);

  const { killChildProcessesSync } = loadRegistry({
    killTreeMock: (pid) => {
      killCalls.push(pid);
      return true;
    },
  });

  const count = killChildProcessesSync();
  assert.equal(count, 1);
  assert.deepEqual(killCalls, [303]);
});

test('spawnDetachedCleanup：detached + unref 派生 cleanup.js（不挂控制台）', () => {
  const spawnCalls = [];
  const unrefCalls = [];
  const fakeChild = { unref: () => unrefCalls.push(true) };

  const { spawnDetachedCleanup } = loadRegistry({
    spawnMock: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return fakeChild;
    },
  });

  const child = spawnDetachedCleanup();

  assert.equal(spawnCalls.length, 1);
  const { cmd, args, opts } = spawnCalls[0];
  assert.equal(cmd, NODE_EXE);
  assert.deepEqual(args, [CLEANUP_JS]);
  assert.equal(opts.detached, true);
  assert.equal(opts.stdio, 'ignore');
  assert.equal(opts.windowsHide, true);
  assert.equal(opts.cwd, PROJECT_ROOT);
  // unref 被调用（不随 CLI 退出而亡）
  assert.equal(unrefCalls.length, 1);
  assert.equal(child, fakeChild);
});

test('createCleanupHandler：同步杀应用层 + 派生 detached + exit(0)', () => {
  clearState();
  const killCalls = [];
  const spawnCalls = [];
  const exitCalls = [];
  const fakeChild = { unref: () => {} };
  state.childProcesses.add(fakeProc(505));

  const { createCleanupHandler } = loadRegistry({
    killTreeMock: (pid) => {
      killCalls.push(pid);
      return true;
    },
    spawnMock: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return fakeChild;
    },
  });

  // process.exit 在 cleanup handler 里直接调用（非加载时捕获），须临时替换
  const prevExit = process.exit;
  process.exit = (code) => {
    exitCalls.push(code);
  };
  try {
    const handler = createCleanupHandler();
    handler();
  } finally {
    process.exit = prevExit;
  }

  // 应用层被杀
  assert.deepEqual(killCalls, [505]);
  // detached 清理被派生
  assert.equal(spawnCalls.length, 1);
  assert.deepEqual(spawnCalls[0].args, [CLEANUP_JS]);
  assert.equal(spawnCalls[0].opts.detached, true);
  // CLI 退出码 0
  assert.deepEqual(exitCalls, [0]);
});

test('createCleanupHandler：防重入（二次触发 no-op）', () => {
  clearState();
  let killCount = 0;
  let spawnCount = 0;
  const exitCalls = [];
  state.childProcesses.add(fakeProc(606));

  const { createCleanupHandler } = loadRegistry({
    killTreeMock: () => {
      killCount += 1;
      return true;
    },
    spawnMock: () => {
      spawnCount += 1;
      return { unref: () => {} };
    },
  });

  const prevExit = process.exit;
  process.exit = (code) => {
    exitCalls.push(code);
  };
  try {
    const handler = createCleanupHandler();
    handler();
    handler(); // 二次触发（如关终端同时 SIGTERM + SIGHUP）
  } finally {
    process.exit = prevExit;
  }

  assert.equal(killCount, 1);
  assert.equal(spawnCount, 1);
  assert.deepEqual(exitCalls, [0]);
});

test('setupSignalHandlers：SIGHUP 全平台注册（Linux 关终端 = SIGHUP）', () => {
  const { setupSignalHandlers } = loadRegistry();
  const handler = setupSignalHandlers();

  assert.ok(handler, '应返回 cleanup 函数');
  // 三个信号都注册了处理器
  assert.ok(process.listeners('SIGINT').includes(handler));
  assert.ok(process.listeners('SIGTERM').includes(handler));
  assert.ok(process.listeners('SIGHUP').includes(handler));

  // 清理：移除本测试注册的处理器，避免污染后续测试 / 真实信号
  process.removeListener('SIGINT', handler);
  process.removeListener('SIGTERM', handler);
  process.removeListener('SIGHUP', handler);
});

// 收尾：确保前台进程表清空
test.after(() => {
  clearState();
});
