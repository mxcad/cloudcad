import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as crypto from 'crypto';

export type WechatTransactionStatus = 'pending' | 'completed' | 'expired';

export type WechatTransactionAction =
  | 'login'
  | 'need_register'
  | 'bind_email'
  | 'bind_phone'
  | 'error';

export interface WechatTransactionData {
  status: WechatTransactionStatus;
  createdAt: number;
  action?: WechatTransactionAction;
  accessToken?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
  error?: string;
  tempToken?: string;
  purpose?: string;
  /** 注销冷静期内登录自动恢复成功标记（账户已自动取消注销） */
  restored?: boolean;
  /** 登录失败错误码（如 ACCOUNT_DEACTIVATED），供前端据码分流弹客服框 */
  errorCode?: string;
  /** 错误码附带参数：注销冷静期天数 / 数据彻底删除延迟天数 */
  graceDays?: number;
  cleanupDays?: number;
}

@Injectable()
export class WechatTransactionService implements OnModuleInit {
  private readonly logger = new Logger(WechatTransactionService.name);
  private readonly prefix = 'wechat:txn:';
  private readonly ttl = 300;

  constructor(
    private configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  onModuleInit() {
    this.redis.on('error', (error) => {
      this.logger.error('Redis连接错误:', error);
    });
  }

  async createTransaction(): Promise<string> {
    const txnId = 'txn_' + crypto.randomBytes(16).toString('hex');
    const data: WechatTransactionData = {
      status: 'pending',
      createdAt: Date.now(),
    };

    await this.redis.setex(this.prefix + txnId, this.ttl, JSON.stringify(data));
    this.logger.log(`微信登录事务已创建: ${txnId}`);
    return txnId;
  }

  async getTransaction(txnId: string): Promise<WechatTransactionData | null> {
    try {
      const raw = await this.redis.get(this.prefix + txnId);
      if (!raw) return null;
      return JSON.parse(raw) as WechatTransactionData;
    } catch {
      return null;
    }
  }

  async completeTransaction(
    txnId: string,
    data: Omit<WechatTransactionData, 'status' | 'createdAt'>
  ): Promise<void> {
    const existing = await this.getTransaction(txnId);
    if (!existing) return;

    const updated: WechatTransactionData = {
      ...existing,
      ...data,
      status: 'completed',
    };

    await this.redis.setex(this.prefix + txnId, 60, JSON.stringify(updated));
    this.logger.log(`微信登录事务已完成: ${txnId}`);
  }

  async failTransaction(
    txnId: string,
    error: string,
    details?: {
      errorCode?: string;
      graceDays?: number;
      cleanupDays?: number;
    }
  ): Promise<void> {
    const existing = await this.getTransaction(txnId);
    if (!existing) return;

    const updated: WechatTransactionData = {
      ...existing,
      status: 'completed',
      error,
      ...details,
    };

    await this.redis.setex(this.prefix + txnId, 60, JSON.stringify(updated));
    this.logger.log(`微信登录事务失败: ${txnId}, error: ${error}`);
  }

  async deleteTransaction(txnId: string): Promise<void> {
    await this.redis.del(this.prefix + txnId);
  }

  async rateLimitCheck(key: string, limit = 3, windowSec = 1): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSec);
    }
    return count;
  }
}
