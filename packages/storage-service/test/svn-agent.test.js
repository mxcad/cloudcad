'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SvnAgent = require('../services/svn-agent');
const { parseLogXml } = require('../services/svn-agent');

/**
 * 假 mx()：捕获 (command, args, opts)，按配置 resolve(stdout) / reject(error)。
 * 通过 SvnAgent 的 DI 注入（new SvnAgent({ mx })），不触碰真实 mx 二进制，
 * 也不再需要 MX_VERSION_TOOL_PATH 指向一个假 CLI（旧 spawn 实现才需要）。
 */
function fakeMx({ stdout = '', reject } = {}) {
  const calls = [];
  const fn = (command, args, opts) => {
    calls.push({ command, args, opts });
    if (reject) return Promise.reject(reject);
    // 与真实 mx() 一致：buffer 模式返回 Buffer，否则 utf8 字符串
    const value = opts && opts.buffer ? Buffer.from(stdout, 'utf8') : stdout;
    return Promise.resolve(value);
  };
  fn.calls = calls;
  return fn;
}

describe('SvnAgent（进程内 mx() adapter）', () => {
  it('commit 走 mx(commit, [path, -m, message])，特殊字符作为单个 argv 元素', async () => {
    const mx = fakeMx({ stdout: 'Committed revision 5.' });
    const agent = new SvnAgent({ mx });
    const dangerous = 'a b;rm -rf / && echo pwned "$(id)"';
    const result = await agent.commit(dangerous, 'msg');
    assert.equal(result.success, true);
    assert.equal(result.output, 'Committed revision 5.');
    assert.equal(mx.calls[0].command, 'commit');
    assert.deepEqual(mx.calls[0].args, [dangerous, '-m', 'msg']);
  });

  it('commit 消息含特殊字符时作为单个 argv 元素（无 shell 解释）', async () => {
    const mx = fakeMx({ stdout: 'ok' });
    const agent = new SvnAgent({ mx });
    await agent.commit('p.dwg', 'fix: "quotes" && & | ; $()');
    assert.deepEqual(mx.calls[0].args, [
      'p.dwg',
      '-m',
      'fix: "quotes" && & | ; $()',
    ]);
  });

  it('history 走 mx(log, [path, --xml]) 并解析 XML（新→旧）', async () => {
    const xml =
      '<?xml version="1.0"?>\n<log>\n' +
      '<logentry revision="5"><author>alice</author><date>2026-01-02T00:00:00.000000Z</date><msg>second</msg></logentry>\n' +
      '<logentry revision="3"><author>bob</author><date>2026-01-01T00:00:00.000000Z</date><msg>first</msg></logentry>\n' +
      '</log>';
    const mx = fakeMx({ stdout: xml });
    const agent = new SvnAgent({ mx });
    const entries = await agent.history('p.dwg');
    assert.equal(mx.calls[0].command, 'log');
    assert.deepEqual(mx.calls[0].args, ['p.dwg', '--xml']);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].revision, 5);
    assert.equal(entries[0].author, 'alice');
    assert.equal(entries[0].message, 'second');
    assert.equal(entries[1].revision, 3);
    assert.equal(entries[1].message, 'first');
  });

  it('cat 走 mx(cat, [-r rev, path]) 带 buffer + maxBuffer', async () => {
    const mx = fakeMx({ stdout: 'filebytes' });
    const agent = new SvnAgent({ mx });
    const buf = await agent.cat('p.dwg', 5);
    assert.equal(mx.calls[0].command, 'cat');
    assert.deepEqual(mx.calls[0].args, ['-r', '5', 'p.dwg']);
    assert.equal(mx.calls[0].opts.buffer, true);
    assert.ok(mx.calls[0].opts.maxBuffer > 0);
    assert.ok(Buffer.isBuffer(buf));
  });

  it('cat 非零退出 → 抛错', async () => {
    const mx = fakeMx({ reject: Object.assign(new Error('svn error'), { code: 1 }) });
    const agent = new SvnAgent({ mx });
    await assert.rejects(() => agent.cat('p.dwg', 5), /svn error/);
  });

  it('commit 非零退出 → {success:false, error}', async () => {
    const mx = fakeMx({ reject: new Error('commit failed') });
    const agent = new SvnAgent({ mx });
    const result = await agent.commit('p', 'm');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('history 出错（如 E160013 无历史）→ 空数组', async () => {
    const mx = fakeMx({ reject: new Error('svn: E160013: path not found') });
    const agent = new SvnAgent({ mx });
    assert.deepEqual(await agent.history('p'), []);
  });

  it('路径穿越参数作为单元素原样传递（不解释）', async () => {
    const mx = fakeMx({ stdout: 'ok' });
    const agent = new SvnAgent({ mx });
    await agent.commit('../../etc/passwd', 'x');
    assert.deepEqual(mx.calls[0].args, ['../../etc/passwd', '-m', 'x']);
  });
});

describe('parseLogXml', () => {
  it('空 <log></log> → 空数组', () => {
    assert.deepEqual(parseLogXml('<?xml version="1.0"?><log></log>'), []);
  });

  it('多行 msg 完整保留', () => {
    const xml =
      '<log><logentry revision="1"><author>a</author><date>2026-01-01T00:00:00Z</date><msg>line1\nline2</msg></logentry></log>';
    const e = parseLogXml(xml);
    assert.equal(e.length, 1);
    assert.equal(e[0].message, 'line1\nline2');
  });
});
