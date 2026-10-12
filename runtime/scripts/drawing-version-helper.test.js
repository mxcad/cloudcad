/**
 * drawing-version-helper.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定「版本控制 CLI 可用性」检查的路径来源：helper 历史上自己拼路径，且用
 * fs.existsSync(runtime/<platform>) 判定 USE_RUNTIME（目录级），而产品运行时用的
 * mxVersionTool/mxpath.js 用 fs.existsSync(runtime/<platform>/subversion)（组件级）。
 * 两者不一致时（升级包覆盖后、提取中断），helper 会去探测一个不存在的 runtime 路径，
 * 并把原因报告成写死的「未找到 svn/mx.exe」——Linux 上点名一个 Windows 可执行文件。
 *
 * 运行：node --test runtime/scripts/drawing-version-helper.test.js
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const helper = require('./drawing-version-helper');
const mxpath = require('../../packages/mxVersionTool/mxpath');
const mxadminpath = require('../../packages/mxVersionTool/mxadminpath');

test('CLI 路径与产品运行时 mxpath 解析结果逐字一致（单一事实源）', () => {
  const config = helper.getSvnConfig();
  assert.equal(config.svnExe, mxpath.default);
  assert.equal(config.svnadminExe, mxadminpath);
});

test('指向绝对路径时，runtime 版本工具目录必须真实存在', () => {
  const config = helper.getSvnConfig();
  // 指向绝对路径才可能"目录在、内容不可执行"；裸名交给 PATH 解析，fs 层无从判断
  if (path.isAbsolute(config.svnExe)) {
    assert.ok(
      fs.existsSync(path.dirname(config.svnExe)),
      'runtime 版本工具目录必须存在'
    );
  }
  if (path.isAbsolute(config.svnadminExe)) {
    assert.equal(
      path.dirname(config.svnadminExe),
      path.dirname(config.svnExe),
      'svn 与 svnadmin 必须解析到同一目录'
    );
  }
});

test('不再输出写死的平台无关文案「未找到 svn/mx.exe」', () => {
  const helperSrc = fs.readFileSync(
    path.join(__dirname, 'drawing-version-helper.js'),
    'utf8'
  );
  assert.ok(
    !/未找到 svn\/mx\.exe/.test(helperSrc),
    '失败文案不得写死跨平台可执行文件名'
  );
});
