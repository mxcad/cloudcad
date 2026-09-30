///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved. The code, documentation, and related materials of
// this software belong to Chengdu Dream Kaide Technology Co., Ltd.
// Applications that include this software must include the following
// copyright statement. This application should reach an agreement with
// Chengdu Dream Kaide Technology Co., Ltd. to use this software, its
// documentation, or related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect } from 'vitest';
import { UrlHelper } from './mxcadUtils';

describe('UrlHelper', () => {
  describe('buildMxwebFileUrl', () => {
    it('构建项目空间 mxweb URL（无查询参数）', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({ nodePath: '202401/n1/a.dwg.mxweb' })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.dwg.mxweb');
    });

    it('nodePath 已含 filesData/ 前缀时不重复添加', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: 'filesData/202401/n1/a.dwg.mxweb',
        })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.dwg.mxweb');
    });

    it('libraryKey 构造图纸库/图块库 URL', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.dwg.mxweb',
          libraryKey: 'drawing',
        })
      ).toBe('/api/v1/library/drawing/filesData/202401/n1/a.dwg.mxweb');
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/b.mxweb',
          libraryKey: 'block',
        })
      ).toBe('/api/v1/library/block/filesData/202401/n1/b.mxweb');
    });

    it('cacheTimestamp 生成 ?t= 查询参数', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.mxweb',
          cacheTimestamp: 1700000000000,
        })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.mxweb?t=1700000000000');
    });

    it('version 生成 ?v= 查询参数且优先于 t', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.mxweb',
          version: '3',
          cacheTimestamp: 1700000000000,
        })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.mxweb?v=3&t=1700000000000');
    });

    it('shareToken 以 & 追加在既有参数后', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.mxweb',
          cacheTimestamp: 1700000000000,
          shareToken: 'tok-1',
        })
      ).toBe(
        '/api/v1/mxcad/filesData/202401/n1/a.mxweb?t=1700000000000&shareToken=tok-1'
      );
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.mxweb',
          version: '3',
          shareToken: 'tok-1',
        })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.mxweb?v=3&shareToken=tok-1');
    });

    it('空 shareToken 不产生查询参数', () => {
      expect(
        UrlHelper.buildMxwebFileUrl({
          nodePath: '202401/n1/a.mxweb',
          shareToken: '',
        })
      ).toBe('/api/v1/mxcad/filesData/202401/n1/a.mxweb');
    });
  });

  describe('extractMxwebFilePath（buildMxwebFileUrl 的逆操作）', () => {
    it('从带 ?t= 的 mxcad URL 提取节点路径', () => {
      expect(
        UrlHelper.extractMxwebFilePath(
          '/api/v1/mxcad/filesData/202401/n1/a.dwg.mxweb?t=1700000000000'
        )
      ).toBe('202401/n1/a.dwg.mxweb');
    });

    it('从 library URL 提取节点路径', () => {
      expect(
        UrlHelper.extractMxwebFilePath(
          '/api/v1/library/drawing/filesData/202401/n1/a.dwg.mxweb?t=1'
        )
      ).toBe('202401/n1/a.dwg.mxweb');
      expect(
        UrlHelper.extractMxwebFilePath(
          '/api/v1/library/block/filesData/202401/n1/b.mxweb'
        )
      ).toBe('202401/n1/b.mxweb');
    });

    it('提取结果回填 buildMxwebFileUrl 得到原 URL', () => {
      const original =
        '/api/v1/mxcad/filesData/202409/abc/零件图.dwg.mxweb?t=123';
      const path = UrlHelper.extractMxwebFilePath(original);
      expect(
        UrlHelper.buildMxwebFileUrl({ nodePath: path!, cacheTimestamp: 123 })
      ).toBe(original);
    });

    it('非 mxweb 访问 URL 返回 null（公共分享/外链）', () => {
      expect(
        UrlHelper.extractMxwebFilePath(
          '/api/v1/public-file/access/abc123/a.mxweb?t=1'
        )
      ).toBeNull();
      expect(UrlHelper.extractMxwebFilePath('/some/other/path')).toBeNull();
    });
  });
});
