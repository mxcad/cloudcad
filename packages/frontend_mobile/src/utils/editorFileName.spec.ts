import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  isInCollaboration: false,
  authenticated: true,
  throwOnRead: false,
}));

vi.mock('@/languages', () => ({
  t: (key: string) => key,
}));
vi.mock('@/composables/useEditorState', () => ({
  useEditorState: () => {
    if (state.throwOnRead) throw new Error('pinia is not installed');
    return { state };
  },
}));
vi.mock('@/composables/useUser', () => ({
  useUser: () => ({ isAuthenticated: { value: state.authenticated } }),
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
    state.authenticated = true;
    state.throwOnRead = false;
  });

  it('已登录非协同时原样返回文件名', () => {
    expect(editorDisplayName('图纸.dwg')).toBe('图纸.dwg');
  });

  it('协同时加 [协同中] 前缀，分隔符为 " - "', () => {
    state.isInCollaboration = true;
    expect(editorDisplayName('图纸.dwg')).toBe('[协同中] - 图纸.dwg');
  });

  it('未登录时加 [未登录] 前缀', () => {
    state.authenticated = false;
    expect(editorDisplayName('图纸.dwg')).toBe('[未登录] - 图纸.dwg');
  });

  it('协同与未登录同时成立时两个前缀按序拼接', () => {
    state.isInCollaboration = true;
    state.authenticated = false;
    expect(editorDisplayName('图纸.dwg')).toBe('[协同中] - [未登录] - 图纸.dwg');
  });

  it('默认空模板名视为无图纸，不显示内部模板名', () => {
    expect(editorDisplayName('empty_template.mxweb')).toBe('');
    expect(editorDisplayName('empty.mxweb')).toBe('');
    state.isInCollaboration = true;
    expect(editorDisplayName('empty_template.mxweb')).toBe('[协同中]');
  });

  it('空文件名只返回前缀', () => {
    expect(editorDisplayName('')).toBe('');
    expect(editorDisplayName(null)).toBe('');
    expect(editorDisplayName(undefined)).toBe('');
    state.authenticated = false;
    expect(editorDisplayName(null)).toBe('[未登录]');
  });

  it('会话态读取失败时按已登录非协同降级，文件名不丢', () => {
    state.throwOnRead = true;
    expect(editorDisplayName('图纸.dwg')).toBe('图纸.dwg');
    expect(editorDisplayName('empty_template.mxweb')).toBe('');
  });
});
