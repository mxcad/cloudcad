///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { join, sep } from 'path';
import { buildMulterChunkDir, buildMulterFilename } from './multer-path.utils';

describe('multer-path.utils — 路径遍历防护', () => {
  const root = join('root', 'uploads');

  describe('buildMulterChunkDir', () => {
    it('合法 hash：落在 root 内的 chunk_<hash> 目录', () => {
      expect(buildMulterChunkDir(root, 'abc123def456')).toBe(
        join(root, 'chunk_abc123def456')
      );
    });

    it('遍历 hash：basename 剥离路径段，仍落在 root 内', () => {
      const dir = buildMulterChunkDir(root, '../../../../etc');
      expect(dir).toBe(join(root, 'chunk_etc'));
      // 关键不变量：不逃逸 root
      expect(dir === root || dir.startsWith(root + sep)).toBe(true);
    });

    it('空 hash：chunk_ 目录仍在 root 内', () => {
      const dir = buildMulterChunkDir(root, '');
      expect(dir).toBe(join(root, 'chunk_'));
      expect(dir.startsWith(root + sep)).toBe(true);
    });
  });

  describe('buildMulterFilename', () => {
    it('合法 hash + 常规文件名：<hash>.<ext>', () => {
      expect(buildMulterFilename({ hash: 'abc123' }, 'my drawing.dwg')).toBe(
        'abc123.dwg'
      );
    });

    it('遍历 hash：剥离为末段，不含分隔符', () => {
      const name = buildMulterFilename(
        { hash: '../../../../etc/passwd' },
        'x.dwg'
      );
      expect(name).toBe('passwd.dwg');
      expect(name.includes('/')).toBe(false);
      expect(name.includes('\\')).toBe(false);
    });

    it('分片：chunk 与 hash 均剥离路径段', () => {
      expect(buildMulterFilename({ hash: 'abc', chunk: '5' }, 'x')).toBe(
        '5_abc'
      );
      const name = buildMulterFilename(
        { hash: 'abc', chunk: '../../../x' },
        'x'
      );
      expect(name).toBe('x_abc');
      expect(name.includes('/')).toBe(false);
      expect(name.includes('\\')).toBe(false);
    });

    it('无 hash：originalname 经 basename 剥离', () => {
      expect(buildMulterFilename({}, 'my file.dwg')).toBe('my file.dwg');
      const name = buildMulterFilename({}, '../../../etc/passwd');
      expect(name).toBe('passwd');
      expect(name.includes('/')).toBe(false);
      expect(name.includes('\\')).toBe(false);
    });
  });
});
