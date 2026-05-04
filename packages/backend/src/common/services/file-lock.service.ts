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

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

interface LockHandle {
  lockPath: string;
  release: () => Promise<void>;
}

@Injectable()
export class FileLockService {
  private readonly logger = new Logger(FileLockService.name);
  private readonly lockDir: string;
  private readonly lockTimeout: number;
  private readonly lockRetryInterval: number;
  private readonly maxRetries: number;

  constructor(private configService: ConfigService<AppConfig>) {
    // 从 filesDataPath 派生锁目录
    const filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    })!;
    this.lockDir = path.join(filesDataPath, '.lock');
    // 从 fileLock 配置获取锁参数
    const fileLockConfig = this.configService.get('fileLock', { infer: true })!;
    this.lockTimeout = fileLockConfig.timeout;
    this.lockRetryInterval = fileLockConfig.retryInterval;
    this.maxRetries = fileLockConfig.maxRetries;
    this.ensureLockDir();
  }

  /**
   * 确保锁目录存在（同步方法，在构造函数中调用）
   */
  private ensureLockDir(): void {
    try {
      if (!fs.existsSync(this.lockDir)) {
        fs.mkdirSync(this.lockDir, { recursive: true });
        this.logger.log(`创建锁目录: ${this.lockDir}`);
      }
    } catch (error) {
      this.logger.error(`初始化锁目录失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取锁文件路径
   */
  private getLockPath(lockName: string): string {
    return path.join(this.lockDir, `${lockName}.lock`);
  }

  /**
   * 获取锁
   * @param lockName 锁名称
   * @returns 锁句柄
   */
  async acquireLock(lockName: string): Promise<LockHandle> {
    const lockPath = this.getLockPath(lockName);
    let retryCount = 0;

    // 确保锁目录存在
    try {
      await fsPromises.mkdir(this.lockDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        this.logger.error(`创建锁目录失败: ${this.lockDir}`, error.stack);
        throw error;
      }
    }

    while (retryCount < this.maxRetries) {
      try {
        // 检查锁文件是否已存在且未过期
        if (fs.existsSync(lockPath)) {
          const stats = await fsPromises.stat(lockPath);
          const lockAge = Date.now() - stats.mtimeMs;

          // 如果锁文件已过期，删除它
          if (lockAge > this.lockTimeout) {
            this.logger.warn(`检测到过期锁文件: ${lockName}，尝试删除`);
            try {
              await fsPromises.unlink(lockPath);
            } catch (error) {
              this.logger.warn(
                `删除过期锁文件失败: ${lockName}`,
                error.message
              );
            }
          } else {
            // 锁文件存在且未过期，等待重试
            this.logger.debug(
              `锁已被占用: ${lockName}，等待重试 (${retryCount + 1}/${this.maxRetries})`
            );
            await this.sleep(this.lockRetryInterval);
            retryCount++;
            continue;
          }
        }

        // 创建锁文件
        const lockContent = {
          pid: process.pid,
          timestamp: Date.now(),
        };

        await fsPromises.writeFile(lockPath, JSON.stringify(lockContent), {
          flag: 'wx',
        });
        this.logger.log(`获取锁成功: ${lockName}`);

        // 返回锁句柄
        return {
          lockPath,
          release: async () => {
            try {
              await fsPromises.unlink(lockPath);
              this.logger.log(`释放锁成功: ${lockName}`);
            } catch (error) {
              this.logger.error(`释放锁失败: ${lockName}`, error.stack);
            }
          },
        };
      } catch (error) {
        if (error.code === 'EEXIST') {
          // 文件已存在，重试
          this.logger.debug(
            `锁已被占用: ${lockName}，等待重试 (${retryCount + 1}/${this.maxRetries})`
          );
          await this.sleep(this.lockRetryInterval);
          retryCount++;
          continue;
        } else {
          this.logger.error(`获取锁失败: ${lockName}`, error.stack);
          throw error;
        }
      }
    }

    throw new InternalServerErrorException(
      `获取锁超时: ${lockName} (重试 ${this.maxRetries} 次后失败)`
    );
  }

  /**
   * 使用锁执行操作
   * @param lockName 锁名称
   * @param fn 要执行的函数
   * @returns 函数执行结果
   */
  async withLock<T>(lockName: string, fn: () => Promise<T>): Promise<T> {
    const lock = await this.acquireLock(lockName);
    let lockReleased = false;

    try {
      return await fn();
    } finally {
      // 确保锁一定释放，即使发生错误
      try {
        await lock.release();
        lockReleased = true;
        this.logger.debug(`锁已释放: ${lockName}`);
      } catch (releaseError) {
        this.logger.error(`释放锁失败: ${lockName}`, releaseError.stack);
        // 锁释放失败，但不影响主流程返回
        if (!lockReleased) {
          // 记录到错误日志，方便后续排查
          this.logger.error(`锁未成功释放，可能导致后续操作阻塞: ${lockName}`);
        }
      }
    }
  }

  /**
   * 检查锁是否存在
   * @param lockName 锁名称
   * @returns 是否存在
   */
  async isLocked(lockName: string): Promise<boolean> {
    const lockPath = this.getLockPath(lockName);
    if (!fs.existsSync(lockPath)) {
      return false;
    }

    const stats = await fsPromises.stat(lockPath);
    const lockAge = Date.now() - stats.mtimeMs;

    // 如果锁文件已过期，返回 false
    return lockAge <= this.lockTimeout;
  }

  /**
   * 强制释放锁（仅用于紧急情况）
   * @param lockName 锁名称
   */
  async forceRelease(lockName: string): Promise<void> {
    const lockPath = this.getLockPath(lockName);
    try {
      await fsPromises.unlink(lockPath);
      this.logger.warn(`强制释放锁: ${lockName}`);
    } catch (error) {
      this.logger.error(`强制释放锁失败: ${lockName}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理所有过期锁
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const entries = await fsPromises.readdir(this.lockDir, {
        withFileTypes: true,
      });
      let cleanedCount = 0;

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.lock')) {
          continue;
        }

        const lockPath = path.join(this.lockDir, entry.name);
        const stats = await fsPromises.stat(lockPath);
        const lockAge = Date.now() - stats.mtimeMs;

        if (lockAge > this.lockTimeout) {
          await fsPromises.unlink(lockPath);
          cleanedCount++;
          this.logger.log(`清理过期锁: ${entry.name}`);
        }
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error(`清理过期锁失败`, error.stack);
      return 0;
    }
  }

  /**
   * 等待指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
