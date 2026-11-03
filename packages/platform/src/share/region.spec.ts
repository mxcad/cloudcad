import { describe, expect, it } from 'vitest';

import {
  appendShareRegionToUrl,
  decodeShareRegion,
  encodeShareRegion,
} from './region';

describe('@cloudcad/platform · share/region', () => {
  const region = {
    minPt: { x: -12.5, y: 3.25 },
    maxPt: { x: 100.75, y: 88.5 },
  };

  it('编码 → 解码 往返一致（含负数/小数）', () => {
    const encoded = encodeShareRegion(region);
    expect(encoded).toBe('-12.5,3.25,100.75,88.5');
    expect(decodeShareRegion(encoded)).toEqual(region);
  });

  it('空/无效区域编码为 null', () => {
    expect(encodeShareRegion(null)).toBeNull();
    expect(encodeShareRegion(undefined)).toBeNull();
    expect(encodeShareRegion({ minPt: { x: NaN, y: 0 }, maxPt: { x: 1, y: 2 } })).toBeNull();
  });

  it('缺参/非法/非有限数解码为 null', () => {
    expect(decodeShareRegion(null)).toBeNull();
    expect(decodeShareRegion(undefined)).toBeNull();
    expect(decodeShareRegion('')).toBeNull();
    expect(decodeShareRegion('1,2,3')).toBeNull(); // 3 段
    expect(decodeShareRegion('1,2,3,abc')).toBeNull();
    expect(decodeShareRegion('1,2,3,Infinity')).toBeNull();
    expect(decodeShareRegion('1,2,3,4,5')).toBeNull(); // 5 段
  });

  it('追加 region 到分享链接（含已有 query）', () => {
    const url = appendShareRegionToUrl(
      'https://cad.example.com/cad-editor/abc?shareToken=tok',
      region,
      'https://cad.example.com'
    );
    expect(url).toBe(
      'https://cad.example.com/cad-editor/abc?shareToken=tok&region=-12.5%2C3.25%2C100.75%2C88.5'
    );
    // 可解码回来
    const u = new URL(url);
    expect(decodeShareRegion(u.searchParams.get('region'))).toEqual(region);
  });

  it('无 region 时 URL 原样返回', () => {
    const url = 'https://cad.example.com/cad-editor/abc?shareToken=tok';
    expect(appendShareRegionToUrl(url, null, 'https://cad.example.com')).toBe(url);
  });

  it('相对 path 也能追加（origin 传入）', () => {
    const url = appendShareRegionToUrl(
      '/cad-editor/abc?shareToken=tok',
      region,
      'https://cad.example.com'
    );
    expect(url).toContain('region=-12.5%2C3.25%2C100.75%2C88.5');
  });
});
