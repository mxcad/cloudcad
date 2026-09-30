/**
 * proc.js getProcessCmdlines 回归测试（node:test，0 外部依赖）
 *
 * 该原语是"stop 是否真的停掉"的判据来源：Windows 上 PM2 用 SIGINT/SIGTERM 终止
 * node 包装进程时不会执行其信号处理器，pg-manager 里的 pg_ctl stop 永不执行，
 * 而 postgres 由 pg_ctl 直接 spawn（不是包装进程的子进程），于是 postgres.exe
 * 残留并锁定 data/postgres。stop 必须扫进程表按目录归属清理，不能只看端口。
 *
 * 运行：node --test runtime/scripts/lib/proc.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { getProcessCmdlines } = require('./proc');

test('返回结构正确的进程行，且能定位当前 node 进程', () => {
  const rows = getProcessCmdlines();
  assert.ok(
    Array.isArray(rows) && rows.length > 0,
    '进程表必须读到至少一个进程'
  );

  // 抽样校验字段形状（不同平台上行序不稳定，只校验前几行的形状）
  for (const row of rows.slice(0, 5)) {
    assert.equal(typeof row.pid, 'number');
    assert.equal(typeof row.name, 'string');
    assert.equal(typeof row.cmdline, 'string');
    assert.equal(typeof row.exe, 'string');
  }

  const self = rows.find((row) => row.pid === process.pid);
  assert.ok(self, '必须包含当前 node 进程（否则残留检测会漏判）');
  assert.match(self.name, /node/i);
});

test('查询失败时抛错，不返回空表', { skip: process.platform !== 'win32' }, () => {
  // 空表语义是"没有残留进程 = 可以删包"，查询失败语义是"不知道有没有残留"。
  // 两者共用 [] 会让 stop 在探测失效时谎报成功，卸载脚本接着删一个仍被占用的
  // 目录——那正是用户报的原始故障形态。故失败必须抛错，由调用方 fail-closed。
  // proc.js 在加载期解构 spawnSync，故先 patch 再清缓存重加载才能换到假实现。
  const cp = require('child_process');
  const orig = cp.spawnSync;
  cp.spawnSync = () => ({ status: 1, stdout: '', stderr: 'boom', error: null });
  const procPath = require.resolve('./proc');
  delete require.cache[procPath];
  try {
    const { getProcessCmdlines: failing } = require('./proc');
    assert.throws(() => failing(), /进程表查询失败/);
  } finally {
    cp.spawnSync = orig;
    delete require.cache[procPath];
    require('./proc');
  }
});

test('查询失败信息带上 stderr，便于定位', { skip: process.platform !== 'win32' }, () => {
  const cp = require('child_process');
  const orig = cp.spawnSync;
  cp.spawnSync = () => ({ status: 1, stdout: '', stderr: 'Access is denied', error: null });
  const procPath = require.resolve('./proc');
  delete require.cache[procPath];
  try {
    const { getProcessCmdlines: failing } = require('./proc');
    assert.throws(() => failing(), /Access is denied/);
  } finally {
    cp.spawnSync = orig;
    delete require.cache[procPath];
    require('./proc');
  }
});
