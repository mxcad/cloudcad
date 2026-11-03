'use strict';

/**
 * 文件名规则（checkFileName / stripDrawingExtension / stripMxwebContainer）纯函数测试。
 *
 * 前端新建文件夹/新建图纸/重命名共用的唯一判定（过去 PC utils 与移动端各写一份）。
 * 逻辑迁至 @cloudcad/contracts（单一事实源），platform 仅 re-export。
 *
 * CommonJS + node --test，跑在 pnpm build 产出的 dist/ 上，零外部依赖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkFileName,
  stripDrawingExtension,
  stripMxwebContainer,
} = require('../dist/files/name-rules.js');

test('checkFileName：空名 / 超长', () => {
  assert.deepEqual(checkFileName(''), { valid: false, reason: 'empty' });
  assert.deepEqual(checkFileName('   '), { valid: false, reason: 'empty' });
  assert.deepEqual(checkFileName('a'.repeat(256)), {
    valid: false,
    reason: 'too_long',
  });
  assert.deepEqual(checkFileName('a'.repeat(255)), { valid: true });
});

test('checkFileName：非法字符 / 控制字符 / 保留名 / 首尾点', () => {
  assert.deepEqual(checkFileName('a<b'), {
    valid: false,
    reason: 'illegal_chars',
  });
  assert.deepEqual(checkFileName('a\\b'), {
    valid: false,
    reason: 'illegal_chars',
  });
  assert.deepEqual(checkFileName('a\x01b'), {
    valid: false,
    reason: 'control_chars',
  });
  assert.deepEqual(checkFileName('CON'), {
    valid: false,
    reason: 'reserved_name',
  });
  assert.deepEqual(checkFileName('com3'), {
    valid: false,
    reason: 'reserved_name',
  });
  assert.deepEqual(checkFileName('.hidden'), {
    valid: false,
    reason: 'dot_edges',
  });
  assert.deepEqual(checkFileName('a.'), { valid: false, reason: 'dot_edges' });
});

test('checkFileName：合法名通过；maxLength 可覆盖', () => {
  assert.deepEqual(checkFileName('图纸-01.dwg'), { valid: true });
  assert.deepEqual(checkFileName('ab', 1), { valid: false, reason: 'too_long' });
});

test('stripDrawingExtension：单层源格式扩展名被剥掉（上传原图节点名）', () => {
  assert.equal(stripDrawingExtension('plan.dwg'), 'plan');
  assert.equal(stripDrawingExtension('plan.DXF'), 'plan');
  assert.equal(stripDrawingExtension('plan.dwt'), 'plan');
});

test('stripDrawingExtension：历史双层扩展名同样归一（回归：另存为滚雪球 plan.dwg.mxweb）', () => {
  assert.equal(stripDrawingExtension('plan.dwg.mxweb'), 'plan');
  assert.equal(stripDrawingExtension('plan.dwg.mxweb.mxweb'), 'plan');
  assert.equal(stripDrawingExtension('111122 41.dwg.mxweb'), '111122 41');
});

test('stripDrawingExtension：纯 mxweb 节点名剥到 mxweb 这一层为止', () => {
  assert.equal(stripDrawingExtension('plan.mxweb'), 'plan');
});

test('stripDrawingExtension：没有格式后缀 / 非格式后缀的名字原样返回，不做猜测式截断', () => {
  assert.equal(stripDrawingExtension('v1.2'), 'v1.2');
  assert.equal(stripDrawingExtension('plan(final)'), 'plan(final)');
  assert.equal(stripDrawingExtension('untitled'), 'untitled');
  assert.equal(stripDrawingExtension('  空白  '), '空白');
});

test('stripDrawingExtension：名字本身就是扩展名时返回空串，由调用方兜底默认名', () => {
  assert.equal(stripDrawingExtension('.mxweb'), '');
  assert.equal(stripDrawingExtension('.dwg'), '');
});

test('stripMxwebContainer：剥掉容器层、保留真实图纸格式后缀', () => {
  assert.equal(stripMxwebContainer('plan.dwg.mxweb'), 'plan.dwg');
  assert.equal(stripMxwebContainer('plan.mxweb'), 'plan');
  assert.equal(stripMxwebContainer('plan.dxf.MXWEB'), 'plan.dxf');
});

test('stripMxwebContainer：多层叠容器一次剥净（引擎导出会再叠一层，回归 mxweb.mxweb）', () => {
  assert.equal(stripMxwebContainer('plan.dwg.mxweb.mxweb'), 'plan.dwg');
});

test('stripMxwebContainer：没有容器后缀的名字原样返回', () => {
  assert.equal(stripMxwebContainer('plan.dwg'), 'plan.dwg');
  assert.equal(stripMxwebContainer('untitled'), 'untitled');
});

test('stripMxwebContainer：契约边界 名字只有容器后缀时返回空串（显示层自行兜底）', () => {
  assert.equal(stripMxwebContainer('.mxweb'), '');
});
