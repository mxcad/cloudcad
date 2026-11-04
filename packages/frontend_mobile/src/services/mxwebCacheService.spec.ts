/**
 * mxwebCacheService 缓存键判定：同一文件（同一 fetch URL）的旧 `?t=` 版本必须能
 * 被识别并清除。
 *
 * 回归点 1（此前 clearMxwebCache 只删精确键）：
 * 保存后调用方算出的是 `?t=<新ts>`，而该键要等 put 之后才存在——精确删除必然落空，
 * 旧的 `?t=<旧ts>` 无人清理，同一文件每次打开/保存净增一条 IDB 条目，只进不出。
 *
 * 回归点 2（本修复）：缓存键 = 引擎 fetch URL 本身（/api/v1/mxcad/filesData/{path}?t=<ts>），
 * 不再带 local/ 前缀、不再由调用方拼 `local/<path>`。引擎 emscripten_start_fetch 按该
 * URL 字符串读 emscripten_filesystem/FILES 键命中缓存；若键仍带 local/ 前缀，引擎读不到，
 * 只能走 blob URL 打开，blob URL 会破坏引擎对文件内 xref/自引用的相对解析 → 打开失败。
 *
 * 注：happy-dom 无 IndexedDB 实现，本规格测的是「删哪些键」的判定（缺陷所在层），
 * IDB 读写层保持薄壳、不在此覆盖。
 */
import { describe, it, expect } from 'vitest';

import { cacheKeyBase, isCacheKeyOf } from './mxwebCacheService';

const PATH = '202610/n1/abc123/n1.mxweb';
const BASE = `/api/v1/mxcad/filesData/${PATH}`;
const base = cacheKeyBase(`${BASE}?t=2000`);

describe('cacheKeyBase', () => {
  it('取 URL 基并丢弃 ?t= 版本段', () => {
    expect(cacheKeyBase(`${BASE}?t=1000`)).toBe(BASE);
  });

  it('无版本段的裸 URL 原样返回', () => {
    expect(cacheKeyBase(BASE)).toBe(BASE);
  });

  it('library 路径基同样成立', () => {
    const libBase = `/api/v1/library/drawing/filesData/${PATH}`;
    expect(cacheKeyBase(`${libBase}?t=1000`)).toBe(libBase);
  });
});

describe('isCacheKeyOf', () => {
  it('同文件的旧 ?t= 版本必须命中——回归点', () => {
    expect(isCacheKeyOf(`${BASE}?t=1000`, base)).toBe(true);
  });

  it('同文件的新 ?t= 版本同样命中', () => {
    expect(isCacheKeyOf(`${BASE}?t=2000`, base)).toBe(true);
  });

  it('无版本段的裸键命中', () => {
    expect(isCacheKeyOf(BASE, base)).toBe(true);
  });

  it('shareToken 查询段同样命中同一文件', () => {
    expect(isCacheKeyOf(`${BASE}?t=1000&shareToken=abc`, base)).toBe(true);
  });

  it('同前缀但不同名的文件不命中', () => {
    expect(isCacheKeyOf(`${BASE}2?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`${BASE}.bak?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`${BASE}-old?t=1`, base)).toBe(false);
  });

  it('短前缀 base 不误删更长路径', () => {
    expect(isCacheKeyOf(`/api/v1/mxcad/filesData/202610?t=1`, base)).toBe(false);
    expect(
      isCacheKeyOf(`/api/v1/mxcad/filesData/202610/n1?t=1`, base)
    ).toBe(false);
  });

  it('不同文件互不影响', () => {
    const otherBase = cacheKeyBase(
      '/api/v1/mxcad/filesData/202610/b/b.mxweb?t=1'
    );
    expect(
      isCacheKeyOf(`/api/v1/mxcad/filesData/202610/b/b.mxweb?t=1`, base)
    ).toBe(false);
    expect(isCacheKeyOf(`${BASE}?t=1`, otherBase)).toBe(false);
  });

  it('非字符串键判否', () => {
    expect(isCacheKeyOf(12345, base)).toBe(false);
    expect(isCacheKeyOf(new Date(), base)).toBe(false);
  });
});

describe('同一文件连续保存后，旧版本全部被选中清除', () => {
  it('两次保存产生的两条键都被选中，只留最新一条', () => {
    const storeKeys = [
      `${BASE}?t=1000`,
      `${BASE}?t=2000`,
      `/api/v1/mxcad/filesData/other/file.mxweb?t=999`,
    ];
    const survivors = storeKeys.filter((key) => !isCacheKeyOf(key, base));
    expect(survivors).toEqual([
      `/api/v1/mxcad/filesData/other/file.mxweb?t=999`,
    ]);
  });

  it('十次保存同样只留最新一条', () => {
    const storeKeys = Array.from({ length: 10 }, (_, i) => `${BASE}?t=${i}`);
    const survivors = storeKeys.filter((key) => !isCacheKeyOf(key, base));
    expect(survivors).toHaveLength(0);
  });
});
