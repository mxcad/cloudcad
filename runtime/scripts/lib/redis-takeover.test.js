/**
 * redis-takeover.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定升级路径接管语义：老无托管 redis 实例（可能无密码/密码不一致，#419）
 * 不在当前 PM2 daemon 名下时，只有"cmdline 含本部署 data/redis 目录"才确认
 * 为本部署旧实例并接管（停旧 + PM2 按 .env 密码重启）；系统自带 redis /
 * 其他部署目录 / 归属未知一律不触碰。
 *
 * 运行：node --test runtime/scripts/lib/redis-takeover.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const {
  isOurRedisInstance,
  detectRedisOwnership,
  stopRedisProcess,
} = require('./redis-takeover');

const OUR_DATA_DIR = '/srv/dev/cloudcad/data/redis';
const OUR_CMDLINE = `redis-server --port 6379 --dir ${OUR_DATA_DIR} --appendonly yes`;

// ---------- isOurRedisInstance ----------

test('cmdline 含本部署 data/redis 绝对路径 → 本部署旧实例', () => {
  assert.equal(isOurRedisInstance(OUR_CMDLINE, OUR_DATA_DIR), true);
});

test('cmdline 指向其他部署目录的 data/redis → 非本部署实例', () => {
  const foreign = 'redis-server --port 6379 --dir /other/root/data/redis';
  assert.equal(isOurRedisInstance(foreign, OUR_DATA_DIR), false);
});

test('系统 redis（config 文件启动）→ 非本部署实例', () => {
  assert.equal(
    isOurRedisInstance('redis-server /etc/redis/redis.conf', OUR_DATA_DIR),
    false
  );
});

test('Windows 反斜杠 + 大小写差异 → 归一化后仍识别', () => {
  const winCmdline =
    'C:\\srv\\CloudCAD\\runtime\\windows\\redis\\redis-server.exe --port 6379 --dir C:\\srv\\CloudCAD\\data\\redis';
  assert.equal(
    isOurRedisInstance(winCmdline, 'c:\\srv\\cloudcad\\data\\redis'),
    true
  );
});

test('空 cmdline / 空 dataDir → 无法确认归属', () => {
  assert.equal(isOurRedisInstance('', OUR_DATA_DIR), false);
  assert.equal(isOurRedisInstance(OUR_CMDLINE, ''), false);
});

// ---------- detectRedisOwnership ----------

test('PID 未知（空）→ unknown，不触碰', () => {
  assert.equal(
    detectRedisOwnership(null, OUR_DATA_DIR, () => OUR_CMDLINE),
    'unknown'
  );
  assert.equal(
    detectRedisOwnership(undefined, OUR_DATA_DIR, () => OUR_CMDLINE),
    'unknown'
  );
});

test('cmdline 不可读（空串）→ unknown，不触碰', () => {
  assert.equal(
    detectRedisOwnership(14584, OUR_DATA_DIR, () => ''),
    'unknown'
  );
});

test('cmdline 含本部署 data/redis 目录 → ours，可接管', () => {
  assert.equal(
    detectRedisOwnership(14584, OUR_DATA_DIR, () => OUR_CMDLINE),
    'ours'
  );
});

test('cmdline 指向其他部署目录 → foreign，不触碰', () => {
  assert.equal(
    detectRedisOwnership(
      14584,
      OUR_DATA_DIR,
      () => 'redis-server --dir /other/root/data/redis'
    ),
    'foreign'
  );
});

test('系统 redis（config 文件启动）→ foreign，不触碰', () => {
  assert.equal(
    detectRedisOwnership(
      14584,
      OUR_DATA_DIR,
      () => 'redis-server /etc/redis/redis.conf'
    ),
    'foreign'
  );
});

// ---------- stopRedisProcess ----------

test('stopRedisProcess 停掉真实目标进程（SIGTERM 优雅退出）', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  assert.ok(child.pid);
  assert.equal(stopRedisProcess(child.pid), true);
  // 等进程退出后验证已死（signal 0 = 探活，ESRCH = 已不存在）
  await new Promise((resolve) => setTimeout(resolve, 300));
  let alive = true;
  try {
    process.kill(child.pid, 0);
  } catch {
    alive = false;
  }
  assert.equal(alive, false);
});

test('stopRedisProcess 空 pid → false', () => {
  assert.equal(stopRedisProcess(null), false);
});

test('stopRedisProcess 目标进程已退出 → true（ESRCH/128 视为已停止，幂等）', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  assert.equal(stopRedisProcess(child.pid), true);
});
