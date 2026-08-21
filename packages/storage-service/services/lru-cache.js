const { LRU_CONFIG } = require('../lib/constants');
const { log } = require('../lib/utils');

/**
 * LRU 热文件缓存（带 TTL）
 * 只缓存小于 maxFileSize 的文件，超过 ttlMs 自动过期
 */
class LruCache {
  constructor() {
    this.maxSize = LRU_CONFIG.maxSize;
    this.maxFileSize = LRU_CONFIG.maxFileSize;
    this.ttlMs = LRU_CONFIG.ttlMs || 300000;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    log(`[LruCache] 初始化: maxSize=${this.maxSize}, maxFileSize=${this.maxFileSize} bytes, ttl=${this.ttlMs}ms`);
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }
    const entry = this.cache.get(key);
    if (Date.now() - entry.addedAt > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.data;
  }

  set(key, data) {
    if (data.length > this.maxFileSize) return;
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, size: data.length, addedAt: Date.now() });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    let totalSize = 0;
    for (const entry of this.cache.values()) totalSize += entry.size;
    const totalRequests = this.hits + this.misses;
    return {
      items: this.cache.size,
      totalSizeBytes: totalSize,
      maxSize: this.maxSize,
      maxFileSize: this.maxFileSize,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests * 100).toFixed(1) + '%' : '0%',
    };
  }
}

module.exports = LruCache;
