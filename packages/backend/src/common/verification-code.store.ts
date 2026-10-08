///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as crypto from 'crypto';
import type Redis from 'ioredis';

export type VerificationCodeStatus = 'valid' | 'expired' | 'wrong' | 'exhausted';

export interface VerificationCodeResult {
  status: VerificationCodeStatus;
  /** 剩余尝试次数（status='wrong' 时） */
  remainingAttempts?: number;
  /** 验证码剩余有效期秒数（status='valid' 时，删除前查询；<=0 为 undefined） */
  expiresIn?: number;
}

/**
 * 验证码存储与原子验证（Redis 后端）—— SMS 与 EMAIL 验证码服务的共享核心。
 *
 * 收敛此前两端各自实现的「6 位码生成 / setex 存储 / 带次数限制的验证」逻辑
 * （架构审查 ⑥：消灭双轨）。验证统一采用**原子 incr 计数**（按 incr 返回值判定
 * 次数上限），避免 get→判定→incr 两步实现在并发错答时全部读到 0 而绕过上限。
 *
 * 本类为无状态纯包装（构造注入 redis），不绑定具体业务：key 前缀、TTL、对外
 * 契约映射（email 返回 {valid,message} / sms 返回 {valid,message,remainingAttempts,expiresIn}）
 * 均由调用方负责。
 */
export class VerificationCodeStore {
  constructor(private readonly redis: Redis) {}

  /** 生成 6 位数字验证码（100000-999999） */
  generateCode(): string {
    return (100000 + crypto.randomInt(900000)).toString();
  }

  /** 存储验证码（TTL 秒） */
  async storeCode(
    codeKey: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.setex(codeKey, ttlSeconds, code);
  }

  /**
   * 原子验证验证码：
   * - 无码/已过期 → `{ status: 'expired' }`
   * - 错答 → 原子 incr 计数；超上限 → `{ status: 'exhausted' }`（删码+计数），
   *   否则 `{ status: 'wrong', remainingAttempts }`
   * - 正确 → 删码+计数 → `{ status: 'valid', expiresIn }`
   */
  async verifyCode(params: {
    codeKey: string;
    attemptsKey: string;
    code: string;
    maxVerifyAttempts: number;
  }): Promise<VerificationCodeResult> {
    const { codeKey, attemptsKey, code, maxVerifyAttempts } = params;
    const storedCode = await this.redis.get(codeKey);
    if (!storedCode) {
      return { status: 'expired' };
    }

    if (storedCode !== code) {
      // 原子 incr 后按返回值判定，避免并发错答时 get→incr 竞态绕过次数上限
      const attempts = await this.redis.incr(attemptsKey);
      const remainingAttempts = maxVerifyAttempts - attempts;
      if (remainingAttempts < 0) {
        await this.redis.del(codeKey);
        await this.redis.del(attemptsKey);
        return { status: 'exhausted' };
      }
      const ttl = await this.redis.ttl(codeKey);
      if (ttl > 0) {
        await this.redis.expire(attemptsKey, ttl);
      }
      return { status: 'wrong', remainingAttempts };
    }

    const ttl = await this.redis.ttl(codeKey);
    await this.redis.del(codeKey);
    await this.redis.del(attemptsKey);
    return { status: 'valid', expiresIn: ttl > 0 ? ttl : undefined };
  }
}
