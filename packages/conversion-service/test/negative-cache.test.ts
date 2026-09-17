import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import NegativeCache from '../services/negative-cache';

describe('NegativeCache（#465 永久失败负缓存）', () => {
  let cache: NegativeCache;

  beforeEach(() => {
    // 内存模式（不传 redisUrl）
    cache = new NegativeCache();
  });

  it('空缓存 isBad=false / size=0 / list=[]', () => {
    assert.equal(cache.isBad('ck_abc'), false);
    assert.equal(cache.size(), 0);
    assert.deepEqual(cache.list(), []);
  });

  it('markBad 后 isBad=true，get 返回 reason + markedAt', () => {
    cache.markBad('ck_abc', '解析失败 code=12');
    assert.equal(cache.isBad('ck_abc'), true);
    assert.equal(cache.size(), 1);
    const entry = cache.get('ck_abc');
    assert.ok(entry);
    assert.equal(entry.contentKey, 'ck_abc');
    assert.equal(entry.reason, '解析失败 code=12');
    assert.ok(entry.markedAt);
  });

  it('isBad 对 null/undefined contentKey 返回 false（不抛错）', () => {
    cache.markBad('ck_abc', 'x');
    assert.equal(cache.isBad(null), false);
    assert.equal(cache.isBad(undefined), false);
  });

  it('reset 单个 known-bad 后 isBad=false', () => {
    cache.markBad('ck_abc', 'x');
    cache.markBad('ck_def', 'y');
    assert.equal(cache.reset('ck_abc'), true);
    assert.equal(cache.isBad('ck_abc'), false);
    assert.equal(cache.isBad('ck_def'), true);
    // 复位不存在的 key 返回 false
    assert.equal(cache.reset('ck_missing'), false);
  });

  it('resetAll 清空全部并返回条数', () => {
    cache.markBad('ck_abc', 'x');
    cache.markBad('ck_def', 'y');
    assert.equal(cache.resetAll(), 2);
    assert.equal(cache.size(), 0);
    assert.deepEqual(cache.list(), []);
  });

  it('list 返回全部条目（含 contentKey）', () => {
    cache.markBad('ck_abc', 'x');
    cache.markBad('ck_def', 'y');
    const items = cache.list();
    assert.equal(items.length, 2);
    const keys = items.map((i) => i.contentKey).sort();
    assert.deepEqual(keys, ['ck_abc', 'ck_def']);
  });

  it('内存模式 isRedis=false', () => {
    assert.equal(cache.isRedis(), false);
  });
});

describe('NegativeCache TTL（S2 过期失效）', () => {
  it('ttlHours=0 → 永久不失效（25h 后仍 isBad=true）', () => {
    let t = 0;
    const cache = new NegativeCache({ ttlHours: 0, now: () => t });
    cache.markBad('ck_a', 'x');
    t += 25 * 3600 * 1000; // 前进 25h
    assert.equal(cache.isBad('ck_a'), true);
    assert.equal(cache.size(), 1);
  });

  it('默认 24h：23h 未过期 / 25h 过期 → isBad=false 且 size=0', () => {
    let t = 0;
    const cache = new NegativeCache({ now: () => t }); // ttlHours 默认 24
    cache.markBad('ck_a', 'x');
    t += 23 * 3600 * 1000; // 23h < 24h，未过期
    assert.equal(cache.isBad('ck_a'), true);
    t += 2 * 3600 * 1000; // 累计 25h > 24h，过期
    assert.equal(cache.isBad('ck_a'), false);
    assert.equal(cache.get('ck_a'), null);
    assert.equal(cache.size(), 0);
    assert.deepEqual(cache.list(), []);
  });

  it('list 只返回未过期条目（过期条目被清除）', () => {
    let t = 0;
    const cache = new NegativeCache({ ttlHours: 1, now: () => t });
    cache.markBad('ck_fresh', 'x');
    t += 30 * 60 * 1000; // 30min
    cache.markBad('ck_stale', 'y');
    t += 40 * 60 * 1000; // ck_stale 已 40min（<1h 未过期），ck_fresh 已 70min（>1h 过期）
    const items = cache.list();
    assert.deepEqual(items.map((i) => i.contentKey), ['ck_stale']);
    // 过期条目被清除
    assert.equal(cache.size(), 1);
    assert.equal(cache.isBad('ck_fresh'), false);
  });

  it('过期后重新 markBad 刷新 markedAt → 重新生效', () => {
    let t = 0;
    const cache = new NegativeCache({ ttlHours: 1, now: () => t });
    cache.markBad('ck_a', 'x');
    t += 61 * 60 * 1000; // 61min > 60min TTL，过期
    assert.equal(cache.isBad('ck_a'), false);
    cache.markBad('ck_a', 'y'); // 重新标记，markedAt 刷新（now=t）
    assert.equal(cache.isBad('ck_a'), true);
    t += 30 * 60 * 1000; // 再过 30min（累计 91min，但标记于 61min 处，距 30min 未过期）
    assert.equal(cache.isBad('ck_a'), true);
    const entry = cache.get('ck_a');
    assert.equal(entry!.reason, 'y');
  });
});
