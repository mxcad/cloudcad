///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Logger } from '@nestjs/common';
import { L2CacheProvider } from './l2-cache.provider';

/** 单次删除条数上限。直接引用常量，改上限时测试随之失败，避免文案与行为脱节 */
const MAX = (L2CacheProvider as unknown as { MAX_PATTERN_DELETE_KEYS: number })
  .MAX_PATTERN_DELETE_KEYS;

interface FakeClient {
  del: jest.Mock;
  scanIterator: jest.Mock;
  on: jest.Mock;
  quit: jest.Mock;
}

interface Fixture {
  provider: L2CacheProvider;
  del: jest.Mock;
  scanIterator: jest.Mock;
  /** 设定下一次扫描要吐出的键 */
  setScan: (keys: string[]) => void;
  /** 已被拉取的键数（用于断言「中止的是扫描」） */
  pulled: () => number;
  /** 让下一次扫描直接抛错 */
  failScan: (error: Error) => void;
  connected: (value: boolean) => void;
  setStats: (hits: number, misses: number) => void;
  stats: () => { hits: number; misses: number };
}

/**
 * 造一个只带被测依赖的 provider：真实 Redis client 换成假实现，并置为已连接。
 * 私有字段一律经这里的辅助方法读写，不用括号访问私有成员。
 */
function createProvider(): Fixture {
  const del = jest.fn(async () => 1);
  const scanIterator = jest.fn();
  const on = jest.fn();
  const quit = jest.fn(async () => undefined);
  const client: FakeClient = { del, scanIterator, on, quit };

  let pendingKeys: string[] = [];
  let pulls = 0;
  let failing: Error | null = null;

  scanIterator.mockImplementation(async function* () {
    if (failing) {
      throw failing;
    }
    for (const key of pendingKeys) {
      pulls++;
      yield key;
    }
  });

  const provider = new L2CacheProvider(
    { get: () => ({ host: 'localhost', port: 6379, db: 0 }) } as never
  );
  const self = provider as unknown as {
    client: FakeClient;
    isConnected: boolean;
    hits: number;
    misses: number;
  };
  self.client = client;
  self.isConnected = true;

  return {
    provider,
    del,
    scanIterator,
    setScan: (keys: string[]) => {
      pendingKeys = keys;
    },
    pulled: () => pulls,
    failScan: (error: Error) => {
      failing = error;
    },
    connected: (value: boolean) => {
      self.isConnected = value;
    },
    setStats: (hits: number, misses: number) => {
      self.hits = hits;
      self.misses = misses;
    },
    stats: () => ({ hits: self.hits, misses: self.misses }),
  };
}

// L2CacheProvider 的 logger 是模块内私有实例，只能从原型上静音
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('L2CacheProvider.deleteByPattern（#482）', () => {
  it('should delete every matched key when under the cap', async () => {
    const { provider, setScan, del, scanIterator } = createProvider();
    setScan(['user:permissions:1', 'user:permissions:2', 'user:permissions:3']);

    await expect(provider.deleteByPattern('user:permissions:*')).resolves.toEqual({
      deleted: 3,
      truncated: false,
    });
    expect(scanIterator).toHaveBeenCalledWith({
      MATCH: 'user:permissions:*',
      COUNT: 200,
    });
    expect(del).toHaveBeenCalledWith([
      'user:permissions:1',
      'user:permissions:2',
      'user:permissions:3',
    ]);
  });

  it('should mark truncated and stop scanning at the cap', async () => {
    const { provider, setScan, del, pulled } = createProvider();
    const keys = Array.from(
      { length: MAX + 1 },
      (_, index) => `user:permissions:${index}`
    );
    setScan(keys);

    await expect(provider.deleteByPattern('user:permissions:*')).resolves.toEqual({
      deleted: MAX,
      truncated: true,
    });

    // 中止的是扫描，不是删除：第 MAX+1 个键仍留在库里
    const deleted = (del.mock.calls[0] as unknown[])[0] as string[];
    expect(deleted).toHaveLength(MAX);
    expect(deleted).not.toContain(keys[MAX]);
    // 只拉到了上限，没有把剩余键继续扫出来
    expect(pulled()).toBe(MAX);
  });

  it('should pull no further keys once the cap is reached', async () => {
    const { provider, setScan, pulled } = createProvider();
    const keys = Array.from(
      { length: MAX * 3 },
      (_, index) => `user:permissions:${index}`
    );
    setScan(keys);

    const result = await provider.deleteByPattern('user:permissions:*');

    expect(result).toEqual({ deleted: MAX, truncated: true });
    expect(pulled()).toBe(MAX);
    expect(keys.length).toBe(MAX * 3);
  });

  it('should report an exact hit at the cap as truncated (cannot tell it apart)', async () => {
    // 循环在拉满上限那一条就 break，没有继续扫，所以无法区分「恰好 5000 条」
    // 和「5001 条以上」——报 truncated 才是诚实的答案，不能为了好看漏报
    const { provider, setScan, del, pulled } = createProvider();
    setScan(Array.from({ length: MAX }, (_, index) => `k:${index}`));

    await expect(provider.deleteByPattern('k:*')).resolves.toEqual({
      deleted: MAX,
      truncated: true,
    });
    expect((del.mock.calls[0] as unknown[])[0]).toHaveLength(MAX);
    expect(pulled()).toBe(MAX);
  });

  it('should delete nothing and call no del when the scan is empty', async () => {
    const { provider, setScan, del } = createProvider();
    setScan([]);

    await expect(provider.deleteByPattern('user:*')).resolves.toEqual({
      deleted: 0,
      truncated: false,
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('should refuse to scan when not connected', async () => {
    const { provider, setScan, scanIterator, connected } = createProvider();
    connected(false);
    setScan(['user:permissions:1']);

    await expect(provider.deleteByPattern('user:permissions:*')).resolves.toEqual({
      deleted: 0,
      truncated: false,
    });
    expect(scanIterator).not.toHaveBeenCalled();
  });

  it('should refuse an empty pattern without scanning', async () => {
    const { provider, scanIterator, del } = createProvider();

    await expect(provider.deleteByPattern('')).resolves.toEqual({
      deleted: 0,
      truncated: false,
    });
    expect(scanIterator).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('should swallow a Redis failure as an empty, non-truncated result', async () => {
    const { provider, setScan, failScan, del } = createProvider();
    setScan(['user:permissions:1']);
    failScan(new Error('READONLY'));

    await expect(provider.deleteByPattern('user:permissions:*')).resolves.toEqual({
      deleted: 0,
      truncated: false,
    });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('L2CacheProvider.clear（#481）', () => {
  it('should only reset the counters and never delete any Redis key', async () => {
    const { provider, setScan, del, scanIterator, setStats, stats } =
      createProvider();
    setScan(['mxcad:sess:abc']);
    setStats(7, 3);

    await provider.clear();

    // 计数器归零
    expect(stats()).toEqual({ hits: 0, misses: 0 });
    // 但绝不删键：全仓没有任何 FLUSHDB，L2 条目一律走 TTL 自然过期
    expect(del).not.toHaveBeenCalled();
    expect(scanIterator).not.toHaveBeenCalled();
  });
});
