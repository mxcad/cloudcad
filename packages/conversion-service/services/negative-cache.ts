import { log } from '../lib/utils';
import RedisClient from '../lib/redis-client';
import { NEGATIVE_CACHE_TTL_HOURS } from '../lib/constants';

const KNOWN_BAD_HASH_KEY = 'fworkflow:known-bad';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';

export interface KnownBadEntry {
  contentKey: string;
  reason: string;
  markedAt: string;
}

interface NegativeCacheOptions {
  redisUrl?: string;
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
  ttlHours?: number;
  now?: () => number;
}

/**
 * 永久失败负缓存（#465）
 *
 * 记录 known-bad 内容身份（contentKey = content_hash + 源文件 + 目标格式 派生，
 * 见 utils.deriveContentKey）。仅「确定性内容失败」（解析/格式错）才标记；
 * 超时/进程被杀等瞬时失败不标记（任务停留转换中，重启续跑）。
 *
 * 提交时命中 known-bad → 直接返回失败状态，不 spawn mxcadassembly（避免反复转注定失败的内容）。
 * 管理员可薄复位（reset / resetAll）。
 *
 * 存储：内存 Map 为唯一读来源；Redis 模式 fire-and-forget 持久化到 Hash
 * （fworkflow:known-bad -> { contentKey: entryJSON }），重启不丢。
 * Redis 不可用时回退内存模式。
 */
class NegativeCache {
  private entries: Map<string, Omit<KnownBadEntry, 'contentKey'>>;
  private _redis: RedisClient | null;
  private _fallback: boolean;
  private _persistQueue: Promise<unknown>;
  private readonly redisUrl: string;
  private readonly commandTimeoutMs?: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: NegativeCacheOptions = {}) {
    this.entries = new Map();
    this._redis = null;
    this._fallback = false;
    this._persistQueue = Promise.resolve();
    this.redisUrl = options.redisUrl || DEFAULT_REDIS_URL;
    this.commandTimeoutMs = options.commandTimeoutMs;
    const ttlHours = options.ttlHours !== undefined ? options.ttlHours : NEGATIVE_CACHE_TTL_HOURS;
    this.ttlMs = ttlHours > 0 ? ttlHours * 3600 * 1000 : 0;
    this.now = options.now || (() => Date.now());
  }

  async init(): Promise<NegativeCache> {
    if (!this.redisUrl) return this;
    try {
      const client = new RedisClient(this.redisUrl, {
        commandTimeoutMs: this.commandTimeoutMs,
      });
      await client.connect(3000);
      const all = await client.command(['HGETALL', KNOWN_BAD_HASH_KEY]);
      const arr = (Array.isArray(all) ? all : []) as any[];
      for (let i = 0; i < arr.length; i += 2) {
        try {
          const contentKey = arr[i].toString();
          const entry = JSON.parse(arr[i + 1].toString()) as Omit<KnownBadEntry, 'contentKey'>;
          this.entries.set(contentKey, entry);
        } catch (err) {
          log(`[NegativeCache] 跳过损坏的 known-bad 记录: ${(err as Error).message}`);
        }
      }
      this._redis = client;
      log(`[NegativeCache] Redis 就绪 (${this.redisUrl}), 已加载 ${this.entries.size} 条 known-bad`);
    } catch (err) {
      this._redis = null;
      this._fallback = true;
      log(`[NegativeCache] Redis 不可用 (${(err as Error).message}), 回退到内存模式`);
    }
    return this;
  }

  isRedis(): boolean {
    return this._redis !== null;
  }

  markBad(contentKey: string, reason: string): void {
    const entry = { reason, markedAt: new Date(this.now()).toISOString() };
    this.entries.set(contentKey, entry);
    this._persist(contentKey, entry);
    log(`[NegativeCache] 标记 known-bad: ${contentKey} (${reason})`);
  }

  isBad(contentKey: string | null | undefined): boolean {
    if (!contentKey) return false;
    const entry = this.entries.get(contentKey);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this._purge(contentKey);
      return false;
    }
    return true;
  }

  get(contentKey: string): KnownBadEntry | null {
    const entry = this.entries.get(contentKey);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this._purge(contentKey);
      return null;
    }
    return { contentKey, ...entry };
  }

  private isExpired(entry: Omit<KnownBadEntry, 'contentKey'>): boolean {
    if (this.ttlMs <= 0) return false;
    return this.now() - new Date(entry.markedAt).getTime() > this.ttlMs;
  }

  private _purge(contentKey: string): void {
    this.entries.delete(contentKey);
    if (this.isRedis()) this._persistDelete(contentKey);
    log(`[NegativeCache] 过期失效 known-bad: ${contentKey}`);
  }

  reset(contentKey: string): boolean {
    const existed = this.entries.delete(contentKey);
    if (existed && this.isRedis()) this._persistDelete(contentKey);
    if (existed) log(`[NegativeCache] 复位 known-bad: ${contentKey}`);
    return existed;
  }

  resetAll(): number {
    const count = this.entries.size;
    this.entries.clear();
    if (count > 0 && this.isRedis()) {
      this._persistQueue = this._persistQueue
        .then(() => this._redis!.command(['DEL', KNOWN_BAD_HASH_KEY]))
        .catch((err) => log(`[NegativeCache] Redis 清空失败: ${(err as Error).message}`));
    }
    if (count > 0) log(`[NegativeCache] 批量复位 ${count} 条 known-bad`);
    return count;
  }

  list(): KnownBadEntry[] {
    const items: KnownBadEntry[] = [];
    for (const [contentKey, entry] of this.entries.entries()) {
      if (this.isExpired(entry)) {
        this._purge(contentKey);
        continue;
      }
      items.push({ contentKey, ...entry });
    }
    return items;
  }

  size(): number {
    let count = 0;
    for (const [contentKey, entry] of this.entries.entries()) {
      if (this.isExpired(entry)) {
        this._purge(contentKey);
      } else {
        count++;
      }
    }
    return count;
  }

  private _persist(contentKey: string, entry: Omit<KnownBadEntry, 'contentKey'>): void {
    if (!this.isRedis()) return;
    this._persistQueue = this._persistQueue
      .then(() =>
        this._redis!.command(['HSET', KNOWN_BAD_HASH_KEY, contentKey, JSON.stringify(entry)])
      )
      .catch((err) =>
        log(`[NegativeCache] Redis 持久化失败 ${contentKey}: ${(err as Error).message}`)
      );
  }

  private _persistDelete(contentKey: string): void {
    if (!this.isRedis()) return;
    this._persistQueue = this._persistQueue
      .then(() => this._redis!.command(['HDEL', KNOWN_BAD_HASH_KEY, contentKey]))
      .catch((err) =>
        log(`[NegativeCache] Redis 删除失败 ${contentKey}: ${(err as Error).message}`)
      );
  }

  async flush(): Promise<void> {
    await this._persistQueue;
  }

  close(): void {
    if (this._redis) {
      this._redis.close();
      this._redis = null;
    }
  }
}

export default NegativeCache;
