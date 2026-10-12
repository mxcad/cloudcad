/**
 * mx() 单一 adapter 的单元测试（node --test）。
 *
 * 核心不变量：密码绝不上 argv（只经 env.SVN_PASSWORD），退出码 → 结构化错误，
 * Buffer/maxBuffer 收集，临时文件清理，binary 覆盖（mxadmin）。
 * 用注入的假 spawn 捕获 argv/env，不触碰真实 mx 二进制。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mx, writeTempText } = require('./mx');

/** 构造假 spawn：捕获 (binary, argv, options)，异步按 {code,stdout,stderr} 回放。 */
function fakeSpawn({ code = 0, stdout = '', stderr = '' } = {}) {
  const fn = (binary, argv, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.__killed = true;
    };
    fn.lastCall = { binary, argv, options, child };
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr, 'utf8'));
      child.emit('close', code);
    });
    return child;
  };
  return fn;
}

test('密码绝不上 argv：走 --password-from-env + env.SVN_PASSWORD', async () => {
  const spawn = fakeSpawn({ code: 0, stdout: 'ok' });
  const out = await mx(
    'cat',
    ['file.txt', '--username', 'u', '--password-from-env'],
    { password: 'secret' },
    { spawn }
  );
  assert.equal(out, 'ok');
  const { argv, options } = spawn.lastCall;
  assert.ok(!argv.includes('secret'), 'argv 不得含明文密码');
  assert.ok(argv.includes('--password-from-env'));
  assert.equal(options.env.SVN_PASSWORD, 'secret');
});

test('无密码时不设 SVN_PASSWORD', async () => {
  const spawn = fakeSpawn({ code: 0, stdout: 'ok' });
  await mx('add', ['a'], {}, { spawn });
  assert.equal(spawn.lastCall.options.env.SVN_PASSWORD, undefined);
});

test('非零退出 → 结构化错误（message=stderr+stdout，附 .code/.stderr/.stdout）', async () => {
  const spawn = fakeSpawn({ code: 1, stdout: 'out', stderr: 'err' });
  await assert.rejects(
    mx('commit', ['a'], {}, { spawn }),
    (e) =>
      e.code === 1 &&
      e.stderr === 'err' &&
      e.stdout === 'out' &&
      e.message.includes('err')
  );
});

test('buffer 模式返回 Buffer，默认返回 utf8 字符串', async () => {
  const spawnBuf = fakeSpawn({ code: 0, stdout: 'bin' });
  const buf = await mx('cat', ['a'], { buffer: true }, { spawn: spawnBuf });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString('utf8'), 'bin');

  const spawnStr = fakeSpawn({ code: 0, stdout: 'txt' });
  const str = await mx('cat', ['a'], {}, { spawn: spawnStr });
  assert.equal(typeof str, 'string');
  assert.equal(str, 'txt');
});

test('maxBuffer 超限 → SIGKILL + reject(MAX_BUFFER)', async () => {
  const spawn = (binary, argv, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.__killed = true;
    };
    setImmediate(() => {
      child.stdout.emit('data', Buffer.alloc(10, 'a')); // 10 字节
      child.stdout.emit('data', Buffer.alloc(10, 'a')); // 累计 20 > maxBuffer 15
    });
    return child;
  };
  await assert.rejects(
    mx('cat', ['a'], { buffer: true, maxBuffer: 15 }, { spawn }),
    (e) => e.code === 'MAX_BUFFER'
  );
});

test('binary 覆盖（mxadmin 用 mxadminPath）', async () => {
  const spawn = fakeSpawn({ code: 0, stdout: 'ok' });
  await mx('create', ['/repo'], { binary: '/custom/mxadmin' }, { spawn });
  assert.equal(spawn.lastCall.binary, '/custom/mxadmin');
});

test('writeTempText 写文件（供 -F 通道）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-test-'));
  const f = writeTempText('commit', 'line1\nline2', { tmpdir: tmp });
  assert.equal(fs.readFileSync(f, 'utf8'), 'line1\nline2');
  fs.unlinkSync(f);
  fs.rmdirSync(tmp);
});

test('cleanup：结束后删除临时文件', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-test-'));
  const f = path.join(tmp, 'msg.txt');
  fs.writeFileSync(f, 'x', 'utf8');
  const spawn = fakeSpawn({ code: 0, stdout: 'ok' });
  await mx('commit', ['-F', f], { cleanup: [f] }, { spawn });
  assert.ok(!fs.existsSync(f), '临时文件应被清理');
  fs.rmdirSync(tmp);
});
