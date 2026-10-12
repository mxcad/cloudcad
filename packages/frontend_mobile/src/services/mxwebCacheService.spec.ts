/**
 * mxwebCacheService 缓存键判定：同一路径的旧 `?t=` 版本必须能被识别并清除。
 *
 * 回归点（此前 clearMxwebCache 只删精确键）：
 * 保存后调用方算出的是 `?t=<新ts>`，而该键要等 put 之后才存在——精确删除必然落空，
 * 旧的 `?t=<旧ts>` 无人清理，同一文件每次打开/保存净增一条 IDB 条目，只进不出。
 *
 * 注：happy-dom 无 IndexedDB 实现，本规格测的是「删哪些键」的判定（缺陷所在层），
 * IDB 读写层保持薄壳、不在此覆盖。
 */
import { describe, it, expect } from 'vitest';

import { buildCacheKey, cacheKeyBase, isCacheKeyOf } from './mxwebCacheService';

const PATH = '202610/n1/abc123/n1.mxweb';
const base = cacheKeyBase(buildCacheKey(PATH, 2000));

describe('cacheKeyBase', () => {
  it('取路径基并丢弃 ?t= 版本段', () => {
    expect(cacheKeyBase(buildCacheKey(PATH, 1000))).toBe(`local/${PATH}`);
  });

  it('带前导斜杠的路径与 buildCacheKey 一致去斜', () => {
    expect(cacheKeyBase(buildCacheKey(`/${PATH}`, 1000))).toBe(`local/${PATH}`);
  });

  it('无版本段的裸键原样返回 local/ 形态', () => {
    expect(cacheKeyBase(PATH)).toBe(`local/${PATH}`);
  });

  it('latest 版本段同样归入路径基', () => {
    expect(cacheKeyBase(buildCacheKey(PATH))).toBe(`local/${PATH}`);
  });
});

describe('isCacheKeyOf', () => {
  it('同文件的旧 ?t= 版本必须命中——回归点', () => {
    expect(isCacheKeyOf(`local/${PATH}?t=1000`, base)).toBe(true);
  });

  it('同文件的新 ?t= 版本同样命中', () => {
    expect(isCacheKeyOf(`local/${PATH}?t=2000`, base)).toBe(true);
  });

  it('无版本段的裸键命中', () => {
    expect(isCacheKeyOf(`local/${PATH}`, base)).toBe(true);
  });

  it('同前缀但不同名的文件不命中', () => {
    expect(isCacheKeyOf(`local/${PATH}2?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`local/${PATH}.bak?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`local/${PATH}-old?t=1`, base)).toBe(false);
  });

  it('短前缀 base 不误删更长路径', () => {
    expect(isCacheKeyOf(`local/202610?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`local/202610/n1?t=1`, base)).toBe(false);
  });

  it('不同文件互不影响', () => {
    const otherBase = cacheKeyBase(buildCacheKey('202610/b/b.mxweb', 1));
    expect(isCacheKeyOf(`local/202610/b/b.mxweb?t=1`, base)).toBe(false);
    expect(isCacheKeyOf(`local/${PATH}?t=1`, otherBase)).toBe(false);
  });

  it('非字符串键判否', () => {
    expect(isCacheKeyOf(12345, base)).toBe(false);
    expect(isCacheKeyOf(new Date(), base)).toBe(false);
  });
});

describe('同一文件连续保存后，旧版本全部被选中清除', () => {
  it('两次保存产生的两条键都被选中，只留最新一条', () => {
    const storeKeys = [
      `local/${PATH}?t=1000`,
      `local/${PATH}?t=2000`,
      `local/other/file.mxweb?t=999`,
    ];
    const survivors = storeKeys.filter((key) => !isCacheKeyOf(key, base));
    expect(survivors).toEqual([`local/other/file.mxweb?t=999`]);
  });

  it('十次保存同样只留最新一条', () => {
    const storeKeys = Array.from({ length: 10 }, (_, i) => `local/${PATH}?t=${i}`);
    const survivors = storeKeys.filter((key) => !isCacheKeyOf(key, base));
    expect(survivors).toHaveLength(0);
  });
});
