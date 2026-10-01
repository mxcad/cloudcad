/**
 * deploy-log 回归测试（node:test，0 外部依赖）
 *
 * 部署/升级过程日志落盘（ADR-0071 一期）的三个不变量：
 * - 镜像期间一切 console 输出（stdout/stderr）同步落盘，且剥离 ANSI 色码
 * - stop() 恢复原始 write，之后输出不再追加（绝不泄漏劫持）
 * - 镜像自身失败（目录不可创建等）不影响主流程
 *
 * 运行：node --test runtime/scripts/lib/deploy-log.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { startDeployLog, runWithDeployLog, stripAnsi } = require('./deploy-log');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-log-test-'));
}

/** 临时接管 stdout 收集 chunk 并**链式转发**给当时已安装的 write（可能是被测 tee），跑完恢复 */
function captureStdout(fn) {
  const chunks = [];
  const next = process.stdout.write; // 当前安装的 write（startDeployLog 后即 tee）
  process.stdout.write = (chunk, enc, cb) => {
    chunks.push(String(chunk));
    return next.call(process.stdout, chunk, enc, cb);
  };
  try {
    fn();
  } finally {
    process.stdout.write = next;
  }
  return chunks;
}

test('stripAnsi 剥离颜色转义但保留普通文本', () => {
  assert.equal(stripAnsi('\x1b[31m红色\x1b[0m 文本'), '红色 文本');
  assert.equal(stripAnsi('\x1b[1;32mbright\x1b[0m'), 'bright');
  assert.equal(stripAnsi('no-escape'), 'no-escape');
});

test('startDeployLog：stdout/stderr 同步镜像 + ANSI 剥离 + stop 恢复', () => {
  const root = tmpRoot();
  const stop = startDeployLog('deploy-test', { rootDir: root });

  captureStdout(() => {
    console.log('\x1b[32m步骤 1 完成\x1b[0m');
    console.error('ERROR: 端口占用');
  });
  stop();
  assert.doesNotThrow(() => stop(), '重复 stop 安全');

  // stop 后不再追加
  captureStdout(() => {
    console.log('这条不应入日志');
  });

  const dir = path.join(root, 'data', 'logs', 'deploy');
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^deploy-test-\d{8}-\d{6}\.log$/);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.ok(content.includes('步骤 1 完成'), 'stdout 已镜像且剥离 ANSI');
  assert.ok(content.includes('ERROR: 端口占用'), 'stderr 已镜像');
  assert.ok(!content.includes('这条不应入日志'), 'stop 后不再追加');
  assert.ok(!content.includes('\x1b['), '文件内无 ANSI 色码');
});

test('runWithDeployLog 异常路径也恢复：镜像内输出入文件，恢复后输出不再追加', async () => {
  const root = tmpRoot();
  await assert.rejects(
    runWithDeployLog(
      'y',
      async () => {
        console.log('镜像内的输出');
        throw new Error('boom');
      },
      { rootDir: path.join(root, 'r2') }
    ),
    /boom/
  );
  // 不变量是行为而非函数身份（实现用 bind 恢复，身份必然变化）：
  const dir = path.join(root, 'r2', 'data', 'logs', 'deploy');
  const file = path.join(
    dir,
    fs.readdirSync(dir).find((f) => f.startsWith('y-') && f.endsWith('.log'))
  );
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('镜像内的输出'), '异常路径的输出已落盘');

  const sizeBefore = fs.statSync(file).size;
  captureStdout(() => {
    console.log('恢复后的输出');
  });
  assert.equal(
    fs.statSync(file).size,
    sizeBefore,
    'runWithDeployLog 结束后不再追加（无劫持泄漏）'
  );
});

test('镜像失败（路径上存在同名文件）返回 no-op stop 且不影响输出', () => {
  const root = tmpRoot();
  // root/data 是文件 → mkdirSync(data/logs/deploy, recursive) 必失败
  fs.writeFileSync(path.join(root, 'data'), 'not a dir');
  const stop = startDeployLog('blocked', { rootDir: root });

  const out = captureStdout(() => {
    console.log('主流程照常输出');
  });
  assert.doesNotThrow(() => stop(), 'no-op stop 可安全调用');
  assert.ok(
    out.join('').includes('主流程照常输出'),
    '镜像失败时输出仍走原通道'
  );
});
