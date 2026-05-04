///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';

/**
 * 锁状态
 */
interface LockState {
  resolve: () => void;
  promise: Promise<void>;
  acquiredAt: number;
}

/**
 * 并发管理器
 *
 * 功能：
 * 1. 提供分布式锁机制，防止并发冲突
 * 2. 支持任务超时控制
 * 3. 支持锁状态查询和管理
 */
@Injectable()
export class ConcurrencyManager {
  private readonly logger = new Logger(ConcurrencyManager.name);
  private readonly locks = new Map<string, LockState>();

  /**
   * 获取锁并执行任务
   *
   * @param key 锁的键
   * @param task 要执行的任务函数
   * @returns 任务执行结果，成功返回 true，失败返回 false
   */
  async acquireLock<T>(key: string, task: () => Promise<T>): Promise<T | null> {
    if (this.locks.has(key)) {
      this.logger.warn(`锁已被占用: ${key}`);
      return null;
    }

    let resolve: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    const lockState: LockState = {
      resolve: resolve!,
      promise,
      acquiredAt: Date.now(),
    };

    this.locks.set(key, lockState);
    this.logger.debug(`获取锁成功: ${key}`);

    try {
      const result = await task();
      return result;
    } catch (error) {
      this.logger.error(`任务执行失败 [${key}]: ${error.message}`, error.stack);
      return null;
    } finally {
      this.releaseLock(key);
    }
  }

  /**
   * 执行带超时的任务
   *
   * @param task 要执行的任务函数
   * @param timeout 超时时间（毫秒）
   * @returns 任务执行结果，成功返回结果，超时或失败返回 null
   */
  async withTimeout<T>(
    task: () => Promise<T>,
    timeout: number
  ): Promise<T | null> {
    try {
      const result = await Promise.race([
        task(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`任务超时 (${timeout}ms)`)),
            timeout
          )
        ),
      ]);
      return result;
    } catch (error) {
      if (error.message.includes('超时')) {
        this.logger.warn(`任务执行超时: ${error.message}`);
      } else {
        this.logger.error(`任务执行失败: ${error.message}`, error.stack);
      }
      return null;
    }
  }

  /**
   * 检查锁是否存在
   *
   * @param key 锁的键
   * @returns 是否存在锁
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * 释放锁
   *
   * @param key 锁的键
   * @returns 是否成功释放
   */
  releaseLock(key: string): boolean {
    const lockState = this.locks.get(key);
    if (!lockState) {
      this.logger.warn(`尝试释放不存在的锁: ${key}`);
      return false;
    }

    const duration = Date.now() - lockState.acquiredAt;
    lockState.resolve();
    this.locks.delete(key);
    this.logger.debug(`释放锁成功: ${key} (持有时间: ${duration}ms)`);

    return true;
  }

  /**
   * 获取所有被锁定的键
   *
   * @returns 锁键数组
   */
  getLockedKeys(): string[] {
    return Array.from(this.locks.keys());
  }

  /**
   * 获取当前锁的数量
   *
   * @returns 锁的数量
   */
  getLockCount(): number {
    return this.locks.size;
  }

  /**
   * 清除所有锁
   *
   * @returns 清除的锁数量
   */
  clearAllLocks(): number {
    const count = this.locks.size;
    this.locks.forEach((lockState, key) => {
      lockState.resolve();
      this.logger.warn(`强制清除锁: ${key}`);
    });
    this.locks.clear();
    this.logger.log(`清除所有锁成功: ${count} 个`);
    return count;
  }
}
