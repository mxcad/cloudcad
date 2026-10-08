import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  deduplicateWorkUsers,
  encodeUserData,
  encodeV3WorkData,
  getWorkCreator,
  parseUserData,
  parseWorkData,
} from './wire';

// 与 wire.ts 自身 codec 同构的测试用 base64（platform 无 node 类型，不用 Buffer）
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

describe('@cloudcad/platform · collaboration/wire', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodeUserData → parseUserData 往返一致（含中文 UTF-8）', () => {
    const encoded = encodeUserData({ v: 1, id: 'u-1', name: '张三', avatar: 'http://x/a.png' });
    const parsed = parseUserData(encoded);
    expect(parsed).toEqual({ v: 1, id: 'u-1', name: '张三', avatar: 'http://x/a.png' });
    // 明文 JSON 与 base64 两种形态都能解析
    expect(parseUserData(JSON.stringify({ v: 1, id: 'u-1', name: '张三' }))).toEqual({
      v: 1,
      id: 'u-1',
      name: '张三',
    });
  });

  it('encodeV3WorkData → parseWorkData 往返一致（v 恒为 3）', () => {
    const payload = {
      drawingId: 'd-1',
      projectId: null,
      drawingName: '图纸',
      sourceType: 'local' as const,
      creatorId: 'u-1',
      creatorName: '张三',
      fileHash: 'abc123',
    };
    const parsed = parseWorkData(encodeV3WorkData(payload));
    expect(parsed).toEqual({ v: 3, ...payload });
  });

  it('parseWorkData 接受 V1/V2/V3（明文或 base64），脏数据一律 null', () => {
    const v1 = { v: 1, drawingId: 'd', projectId: null };
    const v2 = { v: 2, drawingId: 'd', projectId: 'p', creatorId: 'u', creatorName: 'n' };
    expect(parseWorkData(JSON.stringify(v1))).toEqual(v1);
    expect(parseWorkData(b64(JSON.stringify(v2)))).toEqual(v2);

    expect(parseWorkData('not-json')).toBeNull();
    expect(parseWorkData('')).toBeNull();
    // 缺 drawingId
    expect(parseWorkData(JSON.stringify({ v: 1, projectId: null }))).toBeNull();
    // 未知版本
    expect(parseWorkData(JSON.stringify({ v: 99, drawingId: 'd' }))).toBeNull();
    // base64 解码后仍是脏 JSON
    expect(parseWorkData(b64('garbage'))).toBeNull();
  });

  it('parseUserData 只接受 v === 1 且 id 为字符串', () => {
    expect(parseUserData(JSON.stringify({ v: 1, id: 'u' }))).toEqual({ v: 1, id: 'u' });
    expect(parseUserData(b64(JSON.stringify({ v: 1, id: 'u', name: 'n' })))).toEqual({
      v: 1,
      id: 'u',
      name: 'n',
    });
    // v 漂移（线上契约恒为 1）
    expect(parseUserData(JSON.stringify({ v: 2, id: 'u' }))).toBeNull();
    // 缺 id
    expect(parseUserData(JSON.stringify({ v: 1, name: 'n' }))).toBeNull();
    expect(parseUserData('###')).toBeNull();
  });

  it('getWorkCreator：V2/V3 取 creator 字段，V1 返回空对象', () => {
    expect(getWorkCreator({ v: 1, drawingId: 'd', projectId: null })).toEqual({});
    expect(
      getWorkCreator({
        v: 2,
        drawingId: 'd',
        projectId: 'p',
        creatorId: 'u',
        creatorName: 'n',
        creatorAvatar: 'a',
      })
    ).toEqual({ id: 'u', name: 'n', avatar: 'a' });
  });

  it('deduplicateWorkUsers：按解析出的 id 去重，解析失败回落 rawId，长度不齐告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = encodeUserData({ v: 1, id: 'u-1', name: 'a' });
    const b = encodeUserData({ v: 1, id: 'u-2', name: 'b' });
    const dup = encodeUserData({ v: 1, id: 'u-1', name: 'a2' });

    const out = deduplicateWorkUsers(['r-1', 'r-2', 'r-1', 'r-3'], [a, b, dup, 'not-user-data']);
    // u-1 去重（保留首条 rawId r-1）；r-3 的 data 解析失败 → 回落 rawId r-3
    expect(out.linkUserIds).toEqual(['r-1', 'r-2', 'r-3']);
    expect(out.linkUserData).toEqual([a, b, 'not-user-data']);
    expect(warn).not.toHaveBeenCalled();

    // 长度不齐 → 告警 + 按较短一侧截断
    const out2 = deduplicateWorkUsers(['r-1', 'r-2'], [a]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(out2.linkUserIds).toEqual(['r-1']);
    expect(out2.linkUserData).toEqual([a]);

    // 空条目跳过
    expect(deduplicateWorkUsers(['', 'r-2'], ['', b]).linkUserIds).toEqual(['r-2']);
  });
});
