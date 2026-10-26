/**
 * foreground/sentinel.js 回归测试（node:test，0 外部依赖）
 *
 * 哨兵是「关窗 = 全停」的最后兜底：Windows 关控制台发 CTRL_CLOSE_EVENT，Node
 * 不映射为任何 JS 信号，信号处理器永不执行——只有 detached 的哨兵能在关窗后
 * 发现「CLI + 心跳子进程已死」并派生 cleanup.js 跑全量停止。
 *
 * 真实进程集成：把**真实** sentinel.js 拷进临时目录沙箱（PROJECT_ROOT 由
 * __dirname 推导，其旁的 cleanup.js 换成写标记文件的 stub）——stub 保证 'stop'
 * 路径永远不会触碰仓库真实服务。沙箱可选放一个 commands/stop.js stub 模拟
 * 「本目录有另一个前台实例在跑」。覆盖判定矩阵的四个出口：
 * - 存活文件新鲜 → 持续等待（不停、不退）；
 * - 陈旧 + clean 标记 → 静默退出（信号处理器已派生过 cleanup，不重复停）；
 * - 陈旧 + 另一前台驱动在跑 → 静默退出（残留由新实例的端口归属门禁处理）；
 * - 陈旧且无标记 → 派生 cleanup.js 全量停止，删除标记文件后退出。
 *
 * 运行：node --test runtime/scripts/foreground/sentinel.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 建沙箱：<root>/a/b/foreground/ 下放真实 sentinel.js + stub cleanup.js。
 * 哨兵内 PROJECT_ROOT = <root>/a/b，其派生的 cleanup 只会命中 stub。
 * otherInstance=true 时额外放 commands/stop.js stub（模拟另一前台**驱动**在跑；
 * 哨兵只认 cli.js deploy|start 驱动，不认应用层残留，见 sentinel.js 注释）。
 */
function makeSentinelSandbox({ otherInstance = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-sentinel-test-'));
  const fgDir = path.join(root, 'a', 'b', 'foreground');
  fs.mkdirSync(fgDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'sentinel.js'), path.join(fgDir, 'sentinel.js'));
  fs.writeFileSync(
    path.join(fgDir, 'cleanup.js'),
    [
      'const fs = require("fs");',
      'if (process.env.STUB_MARKER) fs.writeFileSync(process.env.STUB_MARKER, String(Date.now()));',
      'process.exit(0);',
      '',
    ].join('\n')
  );
  if (otherInstance) {
    const cmdDir = path.join(root, 'a', 'b', 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(
      path.join(cmdDir, 'stop.js'),
      'module.exports = { listOurDriverProcesses: () => [{ pid: 1 }] };\n'
    );
  }
  return {
    root,
    sentinelJs: path.join(fgDir, 'sentinel.js'),
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function spawnSentinel(sandbox, { aliveFile, cleanFile, markerFile }) {
  return spawn(process.execPath, [sandbox.sentinelJs, aliveFile, cleanFile], {
    cwd: sandbox.root,
    env: { ...process.env, STUB_MARKER: markerFile },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function exitCodeOf(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error('等待哨兵退出超时')),
      timeoutMs
    );
    child.once('exit', (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });
}

/** 等到 fn() 为真（超时抛错）。 */
async function waitFor(fn, timeoutMs = 8000) {
  const started = Date.now();
  while (!fn()) {
    if (Date.now() - started > timeoutMs) throw new Error('等待条件成立超时');
    await sleep(100);
  }
}

/** 把存活文件 mtime 回拨到 30s 前（模拟心跳子进程已死、文件停更）。 */
function makeStale(aliveFile) {
  const past = new Date(Date.now() - 30000);
  fs.utimesSync(aliveFile, past, past);
}

test('哨兵：存活文件新鲜 → 持续等待（不停、不退）', async () => {
  const sb = makeSentinelSandbox();
  const aliveFile = path.join(sb.root, 'alive');
  const cleanFile = path.join(sb.root, 'clean');
  const marker = path.join(sb.root, 'cleanup-ran');
  fs.writeFileSync(aliveFile, '1');

  const child = spawnSentinel(sb, { aliveFile, cleanFile, markerFile: marker });
  // 哨兵 1s 一 poll；心跳新鲜期间应一直等待
  await sleep(2500);
  assert.equal(child.exitCode, null, 'CLI 还活着时哨兵必须仍在运行');
  assert.ok(!fs.existsSync(marker), '不得派生 cleanup');
  child.kill('SIGTERM');
  await exitCodeOf(child);
  sb.dispose();
});

test('哨兵：陈旧 + clean 标记 → 静默退出（信号处理器已派生 cleanup，不重复停）', async () => {
  const sb = makeSentinelSandbox();
  const aliveFile = path.join(sb.root, 'alive');
  const cleanFile = path.join(sb.root, 'clean');
  const marker = path.join(sb.root, 'cleanup-ran');
  fs.writeFileSync(aliveFile, '1');
  makeStale(aliveFile);
  fs.writeFileSync(cleanFile, '1');

  const child = spawnSentinel(sb, { aliveFile, cleanFile, markerFile: marker });
  const code = await exitCodeOf(child);
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(marker), '不得再派生 cleanup（会重复全量停止）');
  sb.dispose();
});

test('哨兵：陈旧 + 另一前台驱动在跑 → 静默退出（避免与快速重试 start 竞态）', async () => {
  const sb = makeSentinelSandbox({ otherInstance: true });
  const aliveFile = path.join(sb.root, 'alive');
  const cleanFile = path.join(sb.root, 'clean');
  const marker = path.join(sb.root, 'cleanup-ran');
  fs.writeFileSync(aliveFile, '1');
  makeStale(aliveFile);

  const child = spawnSentinel(sb, { aliveFile, cleanFile, markerFile: marker });
  const code = await exitCodeOf(child);
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(marker), '新实例在跑时不得全量停止（会杀掉新实例的服务）');
  sb.dispose();
});

test('哨兵：陈旧且无标记 → 派生 cleanup.js 全量停止，删除标记文件后退出', async () => {
  const sb = makeSentinelSandbox();
  const aliveFile = path.join(sb.root, 'alive');
  const cleanFile = path.join(sb.root, 'clean');
  const marker = path.join(sb.root, 'cleanup-ran');
  fs.writeFileSync(aliveFile, '1');
  makeStale(aliveFile);

  const child = spawnSentinel(sb, { aliveFile, cleanFile, markerFile: marker });
  const code = await exitCodeOf(child);
  assert.equal(code, 0);
  // stub cleanup 是 detached 进程，可能比哨兵退出稍晚，给一点余量
  await waitFor(() => fs.existsSync(marker));
  assert.ok(!fs.existsSync(aliveFile), '收尾应删除存活文件');
  assert.ok(!fs.existsSync(cleanFile), '收尾应删除 clean 标记');
  sb.dispose();
});

test('哨兵：缺参数 → 退出码 1', async () => {
  const sb = makeSentinelSandbox();
  const child = spawn(process.execPath, [sb.sentinelJs, path.join(sb.root, 'alive')], {
    stdio: 'ignore',
  });
  const code = await exitCodeOf(child);
  assert.equal(code, 1);
  sb.dispose();
});
