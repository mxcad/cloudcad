import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isCadEditorEntry,
  getCadEditorBackUrl,
} from './cadEditorRoute';

describe('isCadEditorEntry', () => {
  it('命中 /cad-editor、带子路径和会重定向进编辑器的 / 空路径', () => {
    expect(isCadEditorEntry('/cad-editor')).toBe(true);
    expect(isCadEditorEntry('/cad-editor/file-1')).toBe(true);
    expect(isCadEditorEntry('/cad-editor/file-1?nodeId=p1&v=3')).toBe(true);
    expect(isCadEditorEntry('/')).toBe(true);
    expect(isCadEditorEntry('')).toBe(true);
  });

  it('不命中管理类路径', () => {
    expect(isCadEditorEntry('/projects')).toBe(false);
    expect(isCadEditorEntry('/projects/project-1/files')).toBe(false);
    expect(isCadEditorEntry('/personal-space')).toBe(false);
    expect(isCadEditorEntry('/library/drawing')).toBe(false);
  });
});

describe('getCadEditorBackUrl', () => {
  const ORIGINAL = window.location.href;

  beforeEach(() => {
    window.history.replaceState(null, '', '/projects/project-1/files');
  });

  afterEach(() => {
    window.history.replaceState(null, '', ORIGINAL);
  });

  it('管理类页面：返回当前地址', () => {
    expect(getCadEditorBackUrl()).toBe('/projects/project-1/files');
  });

  it('编辑器内：沿用已有管理类 back', () => {
    window.history.replaceState(
      null,
      '',
      '/cad-editor/file-1?nodeId=p1&back=%2Fprojects%2Fproject-1%2Ffiles'
    );
    expect(getCadEditorBackUrl()).toBe('/projects/project-1/files');
  });

  it('编辑器内：back 自身指向编辑器（递归套娃残留）时不携带', () => {
    window.history.replaceState(
      null,
      '',
      '/cad-editor/file-1?nodeId=p1&back=%2Fcad-editor%2Ffile-1%3FnodeId%3Dp1'
    );
    expect(getCadEditorBackUrl()).toBeNull();
  });

  it('编辑器内且无 back：不携带', () => {
    window.history.replaceState(null, '', '/cad-editor/file-1?nodeId=p1');
    expect(getCadEditorBackUrl()).toBeNull();
  });
});
