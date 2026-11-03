import { describe, it, expect, vi } from 'vitest';
// mxcadInstanceManager 是引擎相关模块（mxcad-app 为原生 CAD SDK，测试环境不可加载），
// 必须 mock 原生模块后仅取纯函数 resolveExtReferenceUrl 做分支单测。
vi.mock('mxcad-app', () => ({ MxCADView: class {} }));
vi.mock('@/languages', () => ({ t: (key: string) => key }));

import { resolveExtReferenceUrl } from './mxcadInstanceManager';

describe('resolveExtReferenceUrl', () => {
  describe('public-file/access 分支（未登录/公开分享）', () => {
    it('按父文件 hash 段拼子参照，并去掉 .mxweb 扩展名还原 rawHash', () => {
      const url = resolveExtReferenceUrl(
        'nested.dwg',
        '/api/v1/public-file/access/abc123.dwg.mxweb?t=123'
      );
      expect(url).toBe('/api/v1/public-file/access/abc123/nested.dwg');
    });

    it('shareToken 经 query 传递认证信息', () => {
      const url = resolveExtReferenceUrl(
        'nested.dwg',
        '/api/v1/public-file/access/abc123.dwg.mxweb',
        'tok-123'
      );
      expect(url).toBe(
        '/api/v1/public-file/access/abc123/nested.dwg?shareToken=tok-123'
      );
    });
  });

  describe('filesData 分支（登录图纸库）', () => {
    it('提取 YYYYMM/{nodeId} 基底目录拼子参照', () => {
      const url = resolveExtReferenceUrl(
        'nested.dwg',
        '/api/v1/mxcad/filesData/202610/node-123/abc.mxweb?t=123'
      );
      expect(url).toBe(
        '/api/v1/mxcad/filesData/202610/node-123/nested.dwg'
      );
    });
  });

  describe('external-ref-view 分支（登录态查看含嵌套 xref 的 DWG）', () => {
    it('按父文件 nodeId 拼子参照，返回完整可访问 URL', () => {
      const url = resolveExtReferenceUrl(
        'nested.dwg',
        '/api/v1/mxcad/external-ref-view/node-1/abc.dwg'
      );
      expect(url).toBe('/api/v1/mxcad/external-ref-view/node-1/nested.dwg');
    });

    it('fileName 含子路径/中文时按原样拼接（不重复拼 /api/v1 前缀）', () => {
      const url = resolveExtReferenceUrl(
        '子目录/嵌套 图纸.dwg',
        '/api/v1/mxcad/external-ref-view/node-1/abc.dwg'
      );
      expect(url).toBe(
        '/api/v1/mxcad/external-ref-view/node-1/子目录/嵌套 图纸.dwg'
      );
    });
  });

  describe('兜底分支', () => {
    it('activeUrl 为空时返回原始 fileName', () => {
      expect(resolveExtReferenceUrl('nested.dwg', undefined)).toBe(
        'nested.dwg'
      );
    });

    it('activeUrl 不匹配任何已知形态时返回原始 fileName', () => {
      expect(resolveExtReferenceUrl('nested.dwg', '/some/other/url')).toBe(
        'nested.dwg'
      );
    });
  });
});
