import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  isInCollaboration: false,
  readToken: 'tok' as string | null,
  throwOnRead: false,
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));
vi.mock('@/stores/editor', () => ({
  useEditorStore: () => {
    if (state.throwOnRead) throw new Error('pinia is not installed');
    return { state };
  },
}));
vi.mock('./authSession', () => ({
  readToken: () => state.readToken,
}));

import { editorDisplayName, isEmptyDocumentName } from './editorFileName';

describe('isEmptyDocumentName', () => {
  it('引擎默认空模板判为真', () => {
    expect(isEmptyDocumentName('empty_template.mxweb')).toBe(true);
    expect(isEmptyDocumentName('empty.mxweb')).toBe(true);
  });

  it('真实图纸名与空值判为假', () => {
    expect(isEmptyDocumentName('图纸.dwg')).toBe(false);
    expect(isEmptyDocumentName('empty.dwg')).toBe(false);
    expect(isEmptyDocumentName('')).toBe(false);
    expect(isEmptyDocumentName(null)).toBe(false);
    expect(isEmptyDocumentName(undefined)).toBe(false);
  });
});

describe('editorDisplayName', () => {
  beforeEach(() => {
    state.isInCollaboration = false;
    state.readToken = 'tok';
    state.throwOnRead = false;
  });

  it('显式传登录态：已登录非协同时原样返回文件名', () => {
    expect(editorDisplayName('图纸.dwg', true)).toBe('图纸.dwg');
  });

  it('显式传登录态：协同时加 [协同中] 前缀，分隔符为 " - "', () => {
    state.isInCollaboration = true;
    expect(editorDisplayName('图纸.dwg', true)).toBe('[协同中] - 图纸.dwg');
  });

  it('显式传登录态：未登录时加 [未登录] 前缀', () => {
    expect(editorDisplayName('图纸.dwg', false)).toBe('[未登录] - 图纸.dwg');
  });

  it('显式传登录态：协同与未登录同时成立时两个前缀按序拼接', () => {
    state.isInCollaboration = true;
    expect(editorDisplayName('图纸.dwg', false)).toBe(
      '[协同中] - [未登录] - 图纸.dwg'
    );
  });

  it('不传登录态时现读 localStorage（命令式调用点原语义）', () => {
    expect(editorDisplayName('图纸.dwg')).toBe('图纸.dwg');
    state.readToken = null;
    expect(editorDisplayName('图纸.dwg')).toBe('[未登录] - 图纸.dwg');
  });

  it('默认空模板名视为无图纸，不显示内部模板名', () => {
    expect(editorDisplayName('empty_template.mxweb', true)).toBe('');
    expect(editorDisplayName('empty.mxweb', true)).toBe('');
    state.isInCollaboration = true;
    expect(editorDisplayName('empty_template.mxweb', true)).toBe('[协同中]');
  });

  it('空文件名只返回前缀', () => {
    expect(editorDisplayName(null, true)).toBe('');
    expect(editorDisplayName(undefined, true)).toBe('');
    expect(editorDisplayName(null, false)).toBe('[未登录]');
  });

  it('pinia 未安装时按非协同降级，文件名不丢', () => {
    state.throwOnRead = true;
    expect(editorDisplayName('图纸.dwg', true)).toBe('图纸.dwg');
    expect(editorDisplayName('empty_template.mxweb', true)).toBe('');
  });

  it('剥掉 .mxweb 存储容器层（回归：分享节点名 plan.dwg.mxweb 显示成内部标识）', () => {
    expect(editorDisplayName('plan.dwg.mxweb', true)).toBe('plan.dwg');
    expect(editorDisplayName('plan.mxweb', true)).toBe('plan');
    // 引擎导出会再叠一层容器后缀，标题也必须归一
    expect(editorDisplayName('plan.dwg.mxweb.mxweb', true)).toBe('plan.dwg');
    state.isInCollaboration = true;
    expect(editorDisplayName('plan.dwg.mxweb', true)).toBe('[协同中] - plan.dwg');
  });
});
