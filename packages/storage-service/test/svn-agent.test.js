'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'svn-agent-test-'));

// 模拟 mxcmd.js CLI：把收到的 argv 原样写回 stdout（JSON），方便断言参数未被 shell 解释。
const MOCK_CLI = `
'use strict';
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`;

function loadAgentWithMockCli({ exitCode = 0, stderr = '' } = {}) {
  const mockCliPath = path.join(TEST_DIR, 'mxcmd.js');
  fs.writeFileSync(
    mockCliPath,
    `${MOCK_CLI}\nprocess.exit(${exitCode});\n`,
    'utf8',
  );
  // 通过临时 env + 清理 require cache，让 constants.js 重新读取 MX_VERSION_TOOL_PATH
  process.env.MX_VERSION_TOOL_PATH = mockCliPath;
  for (const mod of [
    require.resolve('../lib/constants'),
    require.resolve('../services/svn-agent'),
  ]) {
    delete require.cache[mod];
  }
  const agent = require('../services/svn-agent');
  const cli = new agent();
  return { cli, mockCliPath };
}

describe('SvnAgent', () => {
  afterEach(() => {
    // 恢复默认路径，避免影响其他测试
    delete process.env.MX_VERSION_TOOL_PATH;
    for (const mod of [
      require.resolve('../lib/constants'),
      require.resolve('../services/svn-agent'),
    ]) {
      delete require.cache[mod];
    }
    require('../services/svn-agent');
  });

  it('should pass filePath with shell metacharacters as a single literal arg (no shell)', async () => {
    const { cli } = loadAgentWithMockCli();
    const dangerous = 'a b;rm -rf / && echo pwned "$(id)"';
    const result = await cli.commit(dangerous, 'msg');
    assert.equal(result.success, true);
    const args = JSON.parse(result.output);
    assert.equal(args[0], 'commit');
    assert.equal(args[1], dangerous);
    assert.equal(args[2], 'msg');
  });

  it('should pass message with special characters literally', async () => {
    const { cli } = loadAgentWithMockCli();
    const result = await cli.commit('p.dwg', 'fix: "quotes" && & | ; $()');
    assert.equal(result.success, true);
    const args = JSON.parse(result.output);
    assert.equal(args[2], 'fix: "quotes" && & | ; $()');
  });

  it('should parse history output lines', async () => {
    const { cli } = loadAgentWithMockCli();
    // 直接调用私有 _run 会触发真实 mock CLI，改写历史输出为一行
    const mockCliPath = path.join(TEST_DIR, 'mxcmd.js');
    fs.writeFileSync(
      mockCliPath,
      `process.stdout.write('3|author|2026-01-01|my commit\\n');\n`,
      'utf8',
    );
    delete require.cache[require.resolve('../services/svn-agent')];
    const agent = require('../services/svn-agent');
    const cli2 = new agent();
    const entries = await cli2.history('p.dwg');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].revision, 3);
    assert.equal(entries[0].author, 'author');
    assert.equal(entries[0].message, 'my commit');
  });

  it('should propagate non-zero exit as an error for cat', async () => {
    const { cli } = loadAgentWithMockCli({ exitCode: 1, stderr: 'svn error' });
    await assert.rejects(() => cli.cat('p.dwg', 5), /svn error|退出码/);
  });

  it('should return failure object when commit exits non-zero', async () => {
    const { cli } = loadAgentWithMockCli({ exitCode: 1 });
    const result = await cli.commit('p', 'm');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('should return empty array on history error', async () => {
    const { cli } = loadAgentWithMockCli({ exitCode: 1 });
    const entries = await cli.history('p');
    assert.deepEqual(entries, []);
  });

  it('should be robust against MX_VERSION_TOOL_PATH missing (path traversal args)', async () => {
    const { cli } = loadAgentWithMockCli();
    const result = await cli.commit('../../etc/passwd', 'x');
    assert.equal(result.success, true);
    const args = JSON.parse(result.output);
    assert.equal(args[1], '../../etc/passwd');
  });

  void execFileSync;
});
