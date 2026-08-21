'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const LruCache = require('../services/lru-cache');

describe('LruCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LruCache();
  });

  it('should store and retrieve entries', () => {
    cache.set('a', Buffer.from('data-a'));

    const value = cache.get('a');
    assert.ok(value);
    assert.equal(value.toString(), 'data-a');
  });

  it('should return null for missing entries and count misses', () => {
    assert.equal(cache.get('missing'), null);
    assert.equal(cache.getStats().misses, 1);
  });

  it('should skip entries larger than maxFileSize', () => {
    const big = Buffer.alloc(cache.maxFileSize + 1, 1);
    cache.set('big', big);

    assert.equal(cache.get('big'), null);
    assert.equal(cache.getStats().items, 0);
  });

  it('should evict the oldest entry when at capacity', () => {
    const smallCache = new LruCache();
    smallCache.maxSize = 2;

    smallCache.set('a', Buffer.from('a'));
    smallCache.set('b', Buffer.from('b'));
    smallCache.set('c', Buffer.from('c'));

    assert.equal(smallCache.get('a'), null);
    assert.equal(smallCache.get('b').toString(), 'b');
    assert.equal(smallCache.get('c').toString(), 'c');
  });

  it('should refresh LRU order on access', () => {
    const smallCache = new LruCache();
    smallCache.maxSize = 2;

    smallCache.set('a', Buffer.from('a'));
    smallCache.set('b', Buffer.from('b'));
    // Access 'a' to make it most-recently-used.
    smallCache.get('a');
    smallCache.set('c', Buffer.from('c'));

    assert.equal(smallCache.get('a').toString(), 'a');
    assert.equal(smallCache.get('b'), null);
  });

  it('should expire entries after ttlMs', () => {
    const smallCache = new LruCache();
    smallCache.ttlMs = 50;

    smallCache.set('a', Buffer.from('a'));
    assert.ok(smallCache.get('a'));

    return new Promise((resolve) => {
      setTimeout(() => {
        assert.equal(smallCache.get('a'), null);
        resolve();
      }, 80);
    });
  });

  it('should delete and clear entries', () => {
    cache.set('a', Buffer.from('a'));
    assert.equal(cache.delete('a'), true);
    assert.equal(cache.delete('a'), false);

    cache.set('b', Buffer.from('b'));
    cache.clear();
    assert.equal(cache.get('b'), null);
  });

  it('should report hit rate', () => {
    cache.set('a', Buffer.from('a'));
    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('nope'); // miss

    const stats = cache.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.equal(stats.hitRate, '66.7%');
  });
});
