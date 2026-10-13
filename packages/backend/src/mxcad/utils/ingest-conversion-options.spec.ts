/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////

import { buildIngestConversionOptions } from './ingest-conversion-options';

describe('ingest-conversion-options', () => {
  describe('buildIngestConversionOptions', () => {
    it('恒置 createPreloadingData: true（摄入方向标记）', () => {
      expect(
        buildIngestConversionOptions({
          srcPath: '/up/abc.dwg',
          fileHash: 'abc',
          debugNodeId: 'node-1',
        }).createPreloadingData
      ).toBe(true);
    });

    it('透传 srcPath 与 fileHash', () => {
      const opts = buildIngestConversionOptions({
        srcPath: '/up/abc.dwg',
        fileHash: 'abc',
        debugNodeId: undefined,
      });
      expect(opts.srcPath).toBe('/up/abc.dwg');
      expect(opts.fileHash).toBe('abc');
    });

    it('透传摄入方向的编排字段（debugNodeId / forceConvert / outname / skipExportGate）', () => {
      const opts = buildIngestConversionOptions({
        srcPath: '/up/abc.dwg',
        fileHash: 'abc',
        debugNodeId: 'node-1',
        forceConvert: true,
        outname: 'abc.bin',
        skipExportGate: true,
      });
      expect(opts.debugNodeId).toBe('node-1');
      expect(opts.forceConvert).toBe(true);
      expect(opts.outname).toBe('abc.bin');
      expect(opts.skipExportGate).toBe(true);
    });

    it('debugNodeId 为 undefined 时不产生键（保持「无节点路径」语义）', () => {
      const opts = buildIngestConversionOptions({
        srcPath: '/up/abc.dwg',
        fileHash: 'abc',
        debugNodeId: undefined,
      });
      // saveConversionDebugInfo 按 `if (options.debugNodeId)` 判空，
      // undefined 与缺键等价；此处断言不会把 undefined 误当成有效节点 id
      expect(opts.debugNodeId).toBeUndefined();
    });
  });
});
