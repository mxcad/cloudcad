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

const {
  getProcessCmdlines,
  parseListenInodes,
  findPidByInodes,
} = require('./proc');

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

// ==================== /proc 兜底探测（parseListenInodes / findPidByInodes / detectPortOwner） ====================
//
// 回归背景：精简镜像可能 ss/lsof/netstat 全缺，且非 root 下 ss 对其他用户
// 进程（如系统装的 redis）只显示 socket 不显示 pid=——getPidByPort 三路全空
// 返回 null，redis 密码门禁只能无差别 blocked（用户 VM 实例：系统 redis 占
// 6379，部署以普通用户运行，部署中止）。/proc 兜底零外部依赖：
// /proc/net/tcp{,6} 拿 LISTEN socket inode（world-readable），再扫 /proc/<pid>/fd
// 的 socket:[inode] 链接定位进程（只能看到当前用户/root 的进程）。

// 真实 /proc/net/tcp 行格式（首行表头）：
//   sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode ...
// 0x18EB=6379，0x1538=5432；st=0A 为 LISTEN，01 为 ESTABLISHED
const TCP_FIXTURE = [
  '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
  '   0: 0100007F:18EB 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345 1 0000000000000000 100 0 0 10 0',
  '   1: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 67890 1 0000000000000000 100 0 0 10 0',
  '   2: 0100007F:18EB 0100007F:C000 01 00000000:00000000 00:00000000 00000000  1000        0 11111 1 0000000000000000 20 4 28 10 0',
].join('\n');

test('parseListenInodes: 只取 LISTEN 状态且端口匹配的 inode', () => {
  // fixture 里 6379 同时有一条 LISTEN（inode 12345）和一条 ESTABLISHED
  // （inode 11111）：结果只含 12345 即证明 st=01 的行被正确排除
  assert.deepEqual([...parseListenInodes(TCP_FIXTURE, null, 6379)], ['12345']);
  assert.deepEqual([...parseListenInodes(TCP_FIXTURE, null, 5432)], ['67890']);
  // 无匹配的端口（6380）→ 空集
  assert.equal(parseListenInodes(TCP_FIXTURE, null, 6380).size, 0);
});

test('parseListenInodes: tcp6 内容同样可解析，null 内容安全跳过', () => {
  const tcp6 = [
    '  sl  local_address                         (port)                             remote_address                        (port)                             st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 00000000000000000000000000000000:18EB 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 22222 1 0000000000000000 100 0 0 10 0',
  ].join('\n');
  assert.deepEqual([...parseListenInodes(null, tcp6, 6379)], ['22222']);
  assert.equal(parseListenInodes(null, null, 6379).size, 0);
});

test('findPidByInodes: 定位持有目标 socket 的进程，跳过不可读进程', () => {
  const pid = findPidByInodes(new Set(['12345']), {
    listPids: () => ['100', '200', '300'],
    listFds: (p) => {
      if (p === '100') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      if (p === '200') return ['3', '4'];
      return ['7'];
    },
    readFdLink: (p, fd) => {
      if (p === '200' && fd === '4') return 'socket:[12345]';
      if (p === '300') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return 'pipe:[999]';
    },
  });
  assert.equal(pid, 200);
});

test('findPidByInodes: 空 inode 集 / pid 表不可读 / 无匹配均返回 null', () => {
  const noop = { listPids: () => [], listFds: () => [], readFdLink: () => '' };
  assert.equal(findPidByInodes(new Set(), noop), null);
  assert.equal(
    findPidByInodes(new Set(['1']), {
      listPids: () => {
        throw new Error('EACCES');
      },
      listFds: () => [],
      readFdLink: () => '',
    }),
    null
  );
  assert.equal(
    findPidByInodes(new Set(['1']), {
      listPids: () => ['100'],
      listFds: () => ['3'],
      readFdLink: () => 'socket:[2]',
    }),
    null
  );
});

// detectPortOwner 的 Linux 分支依赖 /proc，只能在 Linux 上跑（CI 为 ubuntu；
// 本地 Windows 开发机跳过）。手法：patch spawnSync 模拟三工具全缺 + patch fs
// 模拟 /proc 内容，清缓存重载 proc.js（spawnSync 在加载期解构）。
function withProcMocks(
  { spawnResult, procFs },
  fn
) {
  const cp = require('child_process');
  const fs = require('fs');
  const origSpawnSync = cp.spawnSync;
  const origReadFile = fs.readFileSync;
  const origReaddir = fs.readdirSync;
  const origReadlink = fs.readlinkSync;
  cp.spawnSync = () => spawnResult;
  if (procFs) {
    fs.readFileSync = (p, ...a) =>
      procFs.readFile ? procFs.readFile(p, ...a) : origReadFile(p, ...a);
    fs.readdirSync = (p, ...a) =>
      procFs.readdir ? procFs.readdir(p, ...a) : origReaddir(p, ...a);
    fs.readlinkSync = (p) =>
      procFs.readlink ? procFs.readlink(p) : origReadlink(p);
  }
  const procPath = require.resolve('./proc');
  delete require.cache[procPath];
  try {
    return fn(require('./proc'));
  } finally {
    cp.spawnSync = origSpawnSync;
    fs.readFileSync = origReadFile;
    fs.readdirSync = origReaddir;
    fs.readlinkSync = origReadlink;
    delete require.cache[procPath];
    require('./proc');
  }
}

const ENOENT_SPAWN = () => ({
  status: null,
  stdout: '',
  stderr: '',
  error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
});

test('detectPortOwner: 三工具全缺时 /proc 兜底定位同用户进程', {
  skip: process.platform !== 'linux',
}, () => {
  const res = withProcMocks(
    {
      spawnResult: ENOENT_SPAWN(),
      procFs: {
        readFile: (p) => {
          if (p === '/proc/net/tcp') return TCP_FIXTURE;
          if (p === '/proc/net/tcp6')
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
        readdir: (p) => {
          if (p === '/proc') return ['100', '200', 'x'];
          if (p === '/proc/100/fd')
            throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
          if (p === '/proc/200/fd') return ['3', '4'];
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
        readlink: (p) => {
          if (p === '/proc/200/fd/4') return 'socket:[12345]';
          if (p === '/proc/200/fd/3') return 'pipe:[999]';
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      },
    },
    (proc) => proc.detectPortOwner(6379)
  );
  assert.equal(res.pid, 200, '应通过 /proc 兜底定位到同用户进程');
  assert.equal(res.fullScanDone, true);
});

test('detectPortOwner: /proc 可读但无本端口 socket → 确认跨用户（fullScanDone）', {
  skip: process.platform !== 'linux',
}, () => {
  const res = withProcMocks(
    {
      spawnResult: ENOENT_SPAWN(),
      procFs: {
        readFile: (p) => {
          if (p === '/proc/net/tcp')
            return '  sl  local_address rem_address   st\n   0: 0100007F:1538 00000000:0000 0A';
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      },
    },
    (proc) => proc.detectPortOwner(6379)
  );
  assert.equal(res.pid, null);
  assert.equal(
    res.fullScanDone,
    true,
    '/proc/net/tcp 可读即完成全量扫描：socket 不在其中 ⇒ 占用者必属其他用户/命名空间'
  );
});

test('detectPortOwner: /proc 不可用 → 手段不足（fullScanDone=false）', {
  skip: process.platform !== 'linux',
}, () => {
  const res = withProcMocks(
    {
      spawnResult: ENOENT_SPAWN(),
      procFs: {
        readFile: () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      },
    },
    (proc) => proc.detectPortOwner(6379)
  );
  assert.equal(res.pid, null);
  assert.equal(res.fullScanDone, false, '无法排除是本部署实例，调用方必须中止');
});
