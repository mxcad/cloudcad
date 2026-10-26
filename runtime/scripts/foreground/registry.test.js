/**
 * foreground/registry.js 前台退出语义回归测试（node:test，0 外部依赖）
 *
 * 锁定「关终端 = 全停」的核心行为：
 * - killChildProcessesSync：同步 killTree 全量子进程（无 setTimeout——process.exit 会取消定时器）
 * - spawnDetachedCleanup：detached + unref 派生 cleanup.js（终端关闭后仍存活跑全量 stop）
 * - createCleanupHandler：同步杀应用层 + 派生 detached + 写 clean 标记 + exit(0)，防重入
 * - setupSignalHandlers：SIGHUP 全平台注册（Linux 关终端 = SIGHUP，此前仅 Windows 注册是漏网）
 * - armForegroundGuard：武装关窗哨兵（心跳子进程非 detached 随窗亡 + 哨兵 detached 关窗后存活，
 *   覆盖 Windows CTRL_CLOSE_EVENT 不映射为任何 JS 信号的缺口），幂等、失败降级
 *
 * 运行：node --test runtime/scripts/foreground/registry.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { NODE_EXE, PROJECT_ROOT } = require('../lib/context');
const state = require('../lib/state');

const CLEANUP_JS = path.join(__dirname, 'cleanup.js');
const HEARTBEAT_JS = path.join(__dirname, 'heartbeat.js');
const SENTINEL_JS = path.join(__dirname, 'sentinel.js');

/**
 * 把 context.DATA_DIR 临时指向临时目录（registry.js 加载时解构捕获该值），
 * 避免测试把存活文件写进仓库 data/、或真实拉起哨兵进程。
 */
function withTempDataDir(fn) {
  const context = require('../lib/context');
  const prev = context.DATA_DIR;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-registry-test-'));
  context.DATA_DIR = tmp;
  try {
    fn(tmp);
  } finally {
    context.DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 造一个带 on/unref/kill 的假子进程。 */
function fakeChild() {
  return { on: () => {}, unref: () => {}, kill: () => true };
}

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
  // spawn 必须 mock：setupSignalHandlers 会武装关窗哨兵，真实 spawn 会拉起
  // 指向仓库 data/ 的心跳/哨兵进程（测试进程退出后哨兵仍存活并触发真实全量停止）
  withTempDataDir(() => {
    const { setupSignalHandlers } = loadRegistry({
      spawnMock: () => fakeChild(),
    });
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
});

test('armForegroundGuard：心跳（非 detached）+ 哨兵（detached+unref）各拉一次，写存活文件', () => {
  withTempDataDir(() => {
    const spawnCalls = [];
    const unrefCalls = [];
    const { armForegroundGuard } = loadRegistry({
      spawnMock: (cmd, args, opts) => {
        spawnCalls.push({ cmd, args, opts });
        const child = fakeChild();
        child.unref = () => unrefCalls.push(true);
        return child;
      },
    });

    const guard = armForegroundGuard();
    assert.ok(guard, '武装成功应返回 guard 信息');
    assert.equal(spawnCalls.length, 2);

    // 心跳子进程：非 detached（共享 CLI 控制台，关窗 CTRL_CLOSE_EVENT 随 CLI 同亡）
    const [hb, sent] = spawnCalls;
    assert.equal(hb.cmd, NODE_EXE);
    assert.equal(path.basename(hb.args[0]), 'heartbeat.js');
    assert.equal(hb.args[1], guard.aliveFile);
    assert.equal(hb.args[2], '2000');
    assert.notEqual(hb.opts.detached, true, '心跳必须非 detached（随控制台同亡才能停更存活文件）');
    assert.equal(hb.opts.stdio, 'ignore');
    assert.equal(hb.opts.cwd, PROJECT_ROOT);

    // 哨兵：detached + unref（不挂控制台，关窗后存活）
    assert.equal(sent.cmd, NODE_EXE);
    assert.equal(path.basename(sent.args[0]), 'sentinel.js');
    assert.equal(sent.args[1], guard.aliveFile);
    assert.equal(sent.args[2], guard.cleanFile);
    assert.equal(sent.opts.detached, true);
    assert.equal(sent.opts.stdio, 'ignore');
    assert.equal(sent.opts.windowsHide, true);
    assert.equal(unrefCalls.length, 1, '哨兵 unref（不拖住 CLI 进程）');

    // 存活文件已写好（心跳子进程负责持续刷新）
    assert.ok(fs.existsSync(guard.aliveFile));
  });
});

test('armForegroundGuard：幂等（前台路径二次武装不重复拉进程）', () => {
  withTempDataDir(() => {
    let spawnCount = 0;
    const { armForegroundGuard } = loadRegistry({
      spawnMock: () => {
        spawnCount += 1;
        return fakeChild();
      },
    });

    const g1 = armForegroundGuard();
    const g2 = armForegroundGuard();
    assert.equal(g1, g2, '二次武装返回同一 guard');
    assert.equal(spawnCount, 2, '心跳 + 哨兵各只拉一次');
  });
});

test('armForegroundGuard：spawn 失败 → 返回 null（降级为仅信号处理器覆盖，不阻塞启动）', () => {
  withTempDataDir(() => {
    const { armForegroundGuard } = loadRegistry({
      spawnMock: () => {
        throw new Error('ENOENT（模拟）');
      },
    });
    assert.equal(armForegroundGuard(), null);
  });
});

test('createCleanupHandler：退出前写 clean 标记（哨兵见标记静默退出，不重复全量停止）', () => {
  withTempDataDir(() => {
    clearState();
    const exitCalls = [];
    const { armForegroundGuard, createCleanupHandler } = loadRegistry({
      spawnMock: () => fakeChild(),
      killTreeMock: () => true,
    });
    const guard = armForegroundGuard();
    assert.ok(guard);

    const prevExit = process.exit;
    process.exit = (code) => exitCalls.push(code);
    try {
      createCleanupHandler()();
    } finally {
      process.exit = prevExit;
    }

    assert.deepEqual(exitCalls, [0]);
    assert.ok(fs.existsSync(guard.cleanFile), 'clean 标记须在 exit 前同步落盘');
  });
});

// 收尾：确保前台进程表清空
test.after(() => {
  clearState();
});
