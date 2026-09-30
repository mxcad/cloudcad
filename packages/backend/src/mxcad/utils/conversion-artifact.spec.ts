/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cachedArtifactFileName,
  cachedArtifactPath,
  cachedArtifactReady,
  sourceExtension,
} from './conversion-artifact';

describe('conversion-artifact', () => {
  describe('sourceExtension', () => {
    it('取最后一个点之后的部分', () => {
      expect(sourceExtension('plan.dwg')).toBe('dwg');
    });

    it('保留原始大小写', () => {
      expect(sourceExtension('PLAN.DWG')).toBe('DWG');
    });

    it('多点文件名取最后一个扩展名', () => {
      expect(sourceExtension('a.b.dxf')).toBe('dxf');
    });

    it('无扩展名取整名（而非空串）', () => {
      // path.extname('nodot') === ''；摄入路径产出的是 <hash>.nodot，
      // 此处必须同源，否则缓存命中判定对无扩展名文件会错位
      expect(sourceExtension('nodot')).toBe('nodot');
    });
  });

  describe('cachedArtifactFileName', () => {
    it('默认产物扩展名为 .mxweb', () => {
      expect(cachedArtifactFileName('abc', 'plan.dwg')).toBe('abc.dwg.mxweb');
    });

    it('保留源扩展名原始大小写', () => {
      expect(cachedArtifactFileName('abc', 'PLAN.DWG')).toBe('abc.DWG.mxweb');
    });

    it('支持方向性产物扩展名（pdf/图片方向）', () => {
      expect(cachedArtifactFileName('abc', 'plan.dwg', '.pdf')).toBe(
        'abc.dwg.pdf'
      );
      expect(cachedArtifactFileName('abc', 'plan.pdf', '.pdf')).toBe(
        'abc.pdf.pdf'
      );
    });

    it('无扩展名源文件不产生空后缀', () => {
      expect(cachedArtifactFileName('abc', 'nodot')).toBe('abc.nodot.mxweb');
    });

    it('对带点文件名与 path.extname 拼法字节等价（历史版本服务依赖此约定）', () => {
      // mxcad-version-history 曾内联 `${hash}.${extname.replace(/^\./,'')}.mxweb`，
      // 已收敛到本出口。若日后改动命名，须确认该调用点同步。
      for (const name of ['plan.dwg', 'a.b.dxf', 'PLAN.DWG', 'x.dwg.mxweb']) {
        const legacyExt = path.extname(name).replace(/^\./, '');
        expect(cachedArtifactFileName('abc', name)).toBe(
          `abc.${legacyExt}.mxweb`
        );
      }
    });
  });

  describe('cachedArtifactPath', () => {
    it('与上传目录拼接', () => {
      expect(cachedArtifactPath('uploads', 'abc', 'plan.dwg')).toEqual(
        path.join('uploads', 'abc.dwg.mxweb')
      );
    });
  });

  describe('cachedArtifactReady', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cconv-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('产物不存在返回 false', () => {
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dwg')).toBe(false);
    });

    it('目录不存在返回 false（fs 异常回落）', () => {
      expect(
        cachedArtifactReady(path.join(tmpDir, 'no-such-dir'), 'abc', 'plan.dwg')
      ).toBe(false);
    });

    it('空文件返回 false（引擎可能刚建句柄就失败）', () => {
      fs.writeFileSync(path.join(tmpDir, 'abc.dwg.mxweb'), '');
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dwg')).toBe(false);
    });

    it('非空文件返回 true', () => {
      fs.writeFileSync(path.join(tmpDir, 'abc.dwg.mxweb'), 'mxweb-bytes');
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dwg')).toBe(true);
    });

    it('同名目录返回 false（非普通文件）', () => {
      fs.mkdirSync(path.join(tmpDir, 'abc.dwg.mxweb'));
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dwg')).toBe(false);
    });

    it('哈希或源扩展名不同都不算命中', () => {
      fs.writeFileSync(path.join(tmpDir, 'abc.dwg.mxweb'), 'bytes');
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dwg')).toBe(true);
      // 不同 hash
      expect(cachedArtifactReady(tmpDir, 'def', 'plan.dwg')).toBe(false);
      // 不同源扩展名（产物名含源扩展名，不能串到相邻格式的缓存）
      expect(cachedArtifactReady(tmpDir, 'abc', 'plan.dxf')).toBe(false);
    });
  });
});
