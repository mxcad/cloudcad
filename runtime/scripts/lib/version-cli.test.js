/**
 * version-cli.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定「版本控制 CLI 可用性」检查的失败定性：drawing-version-helper 历史上把 spawnSync 的
 * error 与 stderr 全部丢弃——无论文件不存在、无执行位还是依赖库缺失，统一输出写死的
 * 「未找到 svn/mx.exe」（Linux 上点名一个 Windows 可执行文件），把「找不到」当成唯一结论。
 *
 * 另锁定系统回退的 svn/svnadmin 成对规则：只回退 svn 会让仓库校验（svnadmin info）继续调
 * runtime 下那个恰恰不可用的二进制，产出与主检查自相矛盾的结论。
 *
 * 运行：node --test runtime/scripts/lib/version-cli.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { systemSvnPair, classifySpawnError } = require('./version-cli');

const RUNTIME_SVN = 'runtime/linux/subversion/svn';
const SYSTEM_SVN = 'svn';

test('ENOENT → 文件不存在，诊断带出真实探测路径', () => {
  const r = classifySpawnError({ error: { code: 'ENOENT' } }, RUNTIME_SVN);
  assert.equal(r.kind, 'missing');
  assert.match(r.detail, /文件不存在/);
  assert.match(r.detail, /runtime\/linux\/subversion\/svn/);
});

test('EACCES → 无执行权限，给出可操作的修复动作', () => {
  const r = classifySpawnError({ error: { code: 'EACCES' } }, RUNTIME_SVN);
  assert.equal(r.kind, 'not-executable');
  assert.match(r.detail, /无执行权限/);
  assert.match(r.detail, /chmod \+x/);
});

test('stderr 非空 → 执行失败并保留根因（依赖库缺失/glibc/架构不符）', () => {
  const stderr =
    '/usr/local/bin/svn: error while loading shared libraries: libaprutil-1.so.0: cannot open shared object file';
  const r = classifySpawnError({ status: 127, stderr }, RUNTIME_SVN);
  assert.equal(r.kind, 'run-failed');
  assert.match(r.detail, /执行失败/);
  assert.match(r.detail, /libaprutil-1\.so\.0/);
});

test('stderr 过长时截断到 120 字符，避免污染部署日志', () => {
  const stderr = 'x'.repeat(300);
  const r = classifySpawnError({ status: 1, stderr }, SYSTEM_SVN);
  assert.ok(r.detail.endsWith('x'.repeat(120)));
  assert.ok(!r.detail.includes('x'.repeat(121)));
});

test('无 stderr 也无 error → 兜底给出退出码，不谎称"找不到"', () => {
  const r = classifySpawnError({ status: 255 }, RUNTIME_SVN);
  assert.equal(r.kind, 'run-failed');
  assert.match(r.detail, /退出码 255/);
});

test('字段缺失（result 为空）→ 不抛错，仍返回可用诊断', () => {
  const r = classifySpawnError(null, SYSTEM_SVN);
  assert.equal(r.kind, 'run-failed');
  assert.match(r.detail, /退出码 null/);
});

test('Linux 系统回退名：svn / svnadmin（不带扩展名）', () => {
  assert.deepEqual(systemSvnPair(false), { svn: 'svn', svnadmin: 'svnadmin' });
});

test('Windows 系统回退名：svn.exe / svnadmin.exe', () => {
  assert.deepEqual(systemSvnPair(true), {
    svn: 'svn.exe',
    svnadmin: 'svnadmin.exe',
  });
});

test('Windows 系统回退名不是 mx.exe——mx.exe 只属于 runtime 内嵌目录', () => {
  const pair = systemSvnPair(true);
  assert.notEqual(pair.svn, 'mx.exe');
  assert.notEqual(pair.svnadmin, 'mxadmin.exe');
});
