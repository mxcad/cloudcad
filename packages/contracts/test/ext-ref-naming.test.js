'use strict';

/**
 * 外部参照命名契约（ADR-0070 单一事实源）纯函数测试。
 *
 * 契约逻辑此前散落在 10+ 处各写各的假设（登录/游客各自拼 `.mxweb`、检查存在
 * 与文件解析用不同候选、前端查看与引擎加载用相反 URL 形态）。这里钉死唯一约定：
 * - 逻辑名（`block.dwg`）→ 磁盘名（CAD 为 `{名}.mxweb`，其它原名）；
 * - 候选集顺序（标准名 → 逻辑名 → 旧格式 `basename.mxweb`）；
 * - 访问路径段统一 `{hash}/{逻辑名}`（不含 `.mxweb`，后端兜底）。
 *
 * CommonJS + node --test，跑在 pnpm build 产出的 dist/ 上，零外部依赖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCadExtRefName,
  extRefDiskFileName,
  extRefBaseName,
  extRefDiskCandidates,
  extRefAccessPath,
  extRefDisplayName,
} = require('../dist/files/ext-ref-naming.js');

test('isCadExtRefName：识别 CAD 类（.dwg/.dxf/.dwt，大小写不敏感）', () => {
  assert.equal(isCadExtRefName('block.dwg'), true);
  assert.equal(isCadExtRefName('plan.DXF'), true);
  assert.equal(isCadExtRefName('tpl.dwt'), true);
});

test('isCadExtRefName：非 CAD 返回 false（图片/无扩展名/其它）', () => {
  assert.equal(isCadExtRefName('image.png'), false);
  assert.equal(isCadExtRefName('photo.jpg'), false);
  assert.equal(isCadExtRefName('nodot'), false);
  assert.equal(isCadExtRefName('v1.2'), false);
});

test('extRefDiskFileName：CAD 类加 .mxweb 容器', () => {
  assert.equal(extRefDiskFileName('block.dwg'), 'block.dwg.mxweb');
  assert.equal(extRefDiskFileName('a.dxf'), 'a.dxf.mxweb');
});

test('extRefDiskFileName：非 CAD 原名返回', () => {
  assert.equal(extRefDiskFileName('image.png'), 'image.png');
});

test('extRefDiskFileName：已带 .mxweb 的输入原样返回（不叠层）', () => {
  // 约定：入参应为逻辑名（不含 .mxweb）；若传入已含容器层，不再次叠层
  assert.equal(extRefDiskFileName('block.dwg.mxweb'), 'block.dwg.mxweb');
});

test('extRefBaseName：去图纸扩展名', () => {
  assert.equal(extRefBaseName('block.dwg'), 'block');
  assert.equal(extRefBaseName('a.dxf'), 'a');
});

test('extRefBaseName：先剥 .mxweb 容器再剥格式扩展名', () => {
  assert.equal(extRefBaseName('block.dwg.mxweb'), 'block');
});

test('extRefBaseName：无格式后缀原样返回', () => {
  assert.equal(extRefBaseName('image.png'), 'image.png');
  assert.equal(extRefBaseName('nodot'), 'nodot');
});

test('extRefDiskCandidates：CAD 类 标准名→逻辑名→旧格式 basename.mxweb', () => {
  assert.deepEqual(extRefDiskCandidates('block.dwg'), [
    'block.dwg.mxweb',
    'block.dwg',
    'block.mxweb',
  ]);
});

test('extRefDiskCandidates：图片 原名唯一候选', () => {
  assert.deepEqual(extRefDiskCandidates('image.png'), ['image.png']);
});

test('extRefDiskCandidates：空名返回空数组', () => {
  assert.deepEqual(extRefDiskCandidates(''), []);
  assert.deepEqual(extRefDiskCandidates('  '), []);
});

test('extRefAccessPath：统一为 {hash}/{逻辑名}，不含 .mxweb', () => {
  assert.equal(extRefAccessPath('abc123', 'block.dwg'), 'abc123/block.dwg');
  assert.equal(extRefAccessPath('abc123', 'image.png'), 'abc123/image.png');
});

test('extRefDisplayName：剥 .mxweb 容器（多层）', () => {
  assert.equal(extRefDisplayName('block.dwg.mxweb'), 'block.dwg');
  assert.equal(extRefDisplayName('block.dwg.mxweb.mxweb'), 'block.dwg');
});

test('extRefDisplayName：无容器原样返回', () => {
  assert.equal(extRefDisplayName('block.dwg'), 'block.dwg');
  assert.equal(extRefDisplayName('image.png'), 'image.png');
});
