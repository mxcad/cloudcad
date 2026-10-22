import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isCadEditorEntry,
  getCadEditorBackUrl,
  buildCadEditorUrl,
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


describe('buildCadEditorUrl — URL 由文件身份派生（新建/本地文件不携带身份参数）', () => {
  // 新建图纸：无云端节点身份 ⇒ URL 不携带任何身份参数（回归：new file 后 URL 残留旧文件参数）
  it('新建图纸 → /cad-editor，不带 nodeId / hash / fileId 路径段', () => {
    expect(buildCadEditorUrl({ fileId: '' })).toBe('/cad-editor');
  });

  it('新建图纸保留跨文件不失效的 back', () => {
    expect(
      buildCadEditorUrl({ fileId: '', back: '/projects/project-1' })
    ).toBe('/cad-editor?back=%2Fprojects%2Fproject-1');
  });

  // 本地任务（游客/公开路径）：只有 hash 标识，同样不带 fileId 路径段
  it('本地任务 → /cad-editor?hash=，保留 fileName 供刷新后显示', () => {
    expect(
      buildCadEditorUrl({ fileId: '', fileHash: 'abc123', fileName: '图纸.dwg' })
    ).toBe('/cad-editor?hash=abc123&fileName=%E5%9B%BE%E7%BA%B8.dwg');
  });

  it('无云端身份时忽略 parentId（不写 ?nodeId=）', () => {
    expect(
      buildCadEditorUrl({ fileId: '', fileHash: 'abc123', parentId: 'p1' })
    ).toBe('/cad-editor?hash=abc123');
  });

  // 本地 mxweb（引擎本地虚拟盘 + IndexedDB）与新建图纸一致：URL 无身份参数。
  // 即使持有 fileName 也不单独写——没有 hash 的 ?fileName= 刷新时无从重开，
  // 而单独出现会误导后人给本地图纸补 ?hash=（那个参数会被当成公开文件 access URL）
  it('本地 mxweb → /cad-editor，与新建图纸一致不携带 hash / fileName', () => {
    expect(
      buildCadEditorUrl({
        fileId: '',
        fileHash: null,
        fileName: '图纸.mxweb',
      })
    ).toBe('/cad-editor');
  });

  it('云端节点文件 → /cad-editor/:fileId?nodeId=', () => {
    expect(buildCadEditorUrl({ fileId: 'n1', parentId: 'p1' })).toBe(
      '/cad-editor/n1?nodeId=p1'
    );
  });

  it('云端节点无 parentId → 不写 ?nodeId=null', () => {
    expect(buildCadEditorUrl({ fileId: 'n1', parentId: null })).toBe(
      '/cad-editor/n1'
    );
  });

  it('资源库文件 → /cad-editor/:fileId?library=', () => {
    expect(
      buildCadEditorUrl({ fileId: 'n1', libraryKey: 'block', parentId: 'root' })
    ).toBe('/cad-editor/n1?library=block');
  });

  it('云端节点保留 back 与 version', () => {
    expect(
      buildCadEditorUrl({
        fileId: 'n1',
        parentId: 'p1',
        version: '3',
        back: '/projects/project-1/files',
      })
    ).toBe('/cad-editor/n1?nodeId=p1&v=3&back=%2Fprojects%2Fproject-1%2Ffiles');
  });

  // 回归：分享链接打开后 URL 被重写成不含 shareToken 的形态，刷新即从分享通道
  // 掉进节点鉴权通道（游客被判未登录），分享链接变成一次性
  it('分享图纸 → URL 保留 shareToken，刷新后仍走分享鉴权', () => {
    expect(
      buildCadEditorUrl({
        fileId: 'n1',
        shareToken: 'tok-1',
        back: '/projects/project-1/files',
      })
    ).toBe('/cad-editor/n1?shareToken=tok-1&back=%2Fprojects%2Fproject-1%2Ffiles');
  });

  it('无 shareToken（普通节点/本地文件）不写空参数', () => {
    expect(buildCadEditorUrl({ fileId: 'n1' })).toBe('/cad-editor/n1');
    expect(buildCadEditorUrl({ fileId: 'n1', shareToken: null })).toBe(
      '/cad-editor/n1'
    );
  });

  it('资源库文件与 shareToken 互斥使用：库 URL 带 library、不带 shareToken', () => {
    // 库形式的 URL 维持既有协议（认证走请求头），调用方传 null 时不产生该参数
    expect(
      buildCadEditorUrl({ fileId: 'n1', libraryKey: 'drawing', shareToken: null })
    ).toBe('/cad-editor/n1?library=drawing');
  });
});
