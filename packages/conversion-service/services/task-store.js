const { log } = require('../lib/utils');
const RedisClient = require('../lib/redis-client');

const TASKS_HASH_KEY = 'fworkflow:tasks';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';

/**
 * 任务状态存储
 * 支持 in-memory（local）和 Redis（standalone）两种模式
 *
 * Redis 模式: 内存缓存为唯一读来源（保持现有同步 API 签名不变），
 * 所有写操作同步更新缓存后 fire-and-forget 持久化到 Redis Hash
 * （fworkflow:tasks -> { taskId: taskJSON }）。
 * 启动时 init() 从 Redis 全量加载存量任务，重启不丢。
 * Redis 不可用时自动回退到内存模式，保证服务可启动。
 */
class TaskStore {
  constructor(driver = 'local', options = {}) {
    this.driver = driver;
    this.options = options;
    this.tasks = new Map();
    this._redis = null;
    this._fallback = false;
    this._persistQueue = Promise.resolve();
    log(`[TaskStore] 初始化, driver=${driver}`);
  }

  // Redis 模式异步初始化: 连接 + 加载存量任务。失败时回退内存模式。
  async init() {
    if (this.driver !== 'redis') return this;
    const url = this.options.redisUrl || DEFAULT_REDIS_URL;
    try {
      const client = new RedisClient(url, {
        commandTimeoutMs: this.options.commandTimeoutMs,
      });
      await client.connect(this.options.connectTimeoutMs || 3000);
      const all = await client.command(['HGETALL', TASKS_HASH_KEY]);
      for (let i = 0; i < all.length; i += 2) {
        try {
          this.tasks.set(all[i].toString(), JSON.parse(all[i + 1].toString()));
        } catch (err) {
          log(`[TaskStore] 跳过损坏的任务记录: ${all[i]} - ${err.message}`);
        }
      }
      this._redis = client;
      log(`[TaskStore] Redis 就绪 (${url}), 已加载 ${this.tasks.size} 个存量任务`);
    } catch (err) {
      this._redis = null;
      this._fallback = true;
      log(`[TaskStore] Redis 不可用 (${err.message}), 回退到内存模式`);
    }
    return this;
  }

  isRedis() {
    return this.driver === 'redis' && !this._fallback;
  }

  isFallback() {
    return this.driver === 'redis' && this._fallback;
  }

  getDriver() {
    return this.driver;
  }

  create(task) {
    const record = {
      ...task,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      error: null,
      callbackUrl: task.callbackUrl || null,
    };
    this.tasks.set(task.id, record);
    this._persist(task.id, record);
    return record;
  }

  get(taskId) {
    return this.tasks.get(taskId) || null;
  }

  updateStatus(taskId, status, extra = {}) {
    const record = this.tasks.get(taskId);
    if (!record) return null;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    if (extra.result) record.result = extra.result;
    if (extra.error) record.error = extra.error;
    if (extra.progress !== undefined) record.progress = extra.progress;
    this._persist(taskId, record);
    return record;
  }

  list(filter = {}) {
    const results = [];
    for (const task of this.tasks.values()) {
      if (filter.status && task.status !== filter.status) continue;
      results.push(task);
    }
    return results;
  }

  delete(taskId) {
    const existed = this.tasks.delete(taskId);
    if (existed && this.isRedis()) this._persistDelete(taskId);
    return existed;
  }

  getStats() {
    let pending = 0, processing = 0, completed = 0, failed = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'PENDING') pending++;
      else if (t.status === 'PROCESSING') processing++;
      else if (t.status === 'COMPLETED') completed++;
      else if (t.status === 'FAILED') failed++;
    }
    return { total: this.tasks.size, pending, processing, completed, failed };
  }

  // 串行化写操作，保证同一 taskId 的多次更新按序持久化
  _persist(taskId, record) {
    if (!this.isRedis()) return;
    this._persistQueue = this._persistQueue
      .then(() => this._redis.command(['HSET', TASKS_HASH_KEY, taskId, JSON.stringify(record)]))
      .catch((err) => log(`[TaskStore] Redis 持久化失败 ${taskId}: ${err.message}`));
  }

  _persistDelete(taskId) {
    this._persistQueue = this._persistQueue
      .then(() => this._redis.command(['HDEL', TASKS_HASH_KEY, taskId]))
      .catch((err) => log(`[TaskStore] Redis 删除失败 ${taskId}: ${err.message}`));
  }

  // 等待所有排队中的持久化完成（优雅关闭时调用）
  async flush() {
    await this._persistQueue;
  }

  // 释放 Redis 连接
  close() {
    if (this._redis) {
      this._redis.close();
      this._redis = null;
    }
  }
}

module.exports = TaskStore;
