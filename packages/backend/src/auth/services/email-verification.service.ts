///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class EmailVerificationService {
  private readonly codeTTL: number;
  private readonly rateLimitTTL: number;

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.codeTTL = cacheTTL.verificationCode;
    this.rateLimitTTL = cacheTTL.verificationRateLimit;
  }

  private getCodeKey(email: string): string {
    return `email_verification:code:${email}`;
  }

  private getRateLimitKey(email: string): string {
    return `email_verification:rate_limit:${email}`;
  }

  async generateVerificationToken(email: string): Promise<string> {
    // 生成6位数字验证码（使用加密安全的随机数生成器）
    const crypto = await import('crypto');
    const code = (100000 + crypto.randomInt(900000)).toString();

    // 存储到 Redis，配置的过期时间
    const key = this.getCodeKey(email);
    await this.redis.setex(key, this.codeTTL, code);
    return code;
  }

  async sendVerificationEmail(email: string): Promise<void> {
    // 检查发送频率限制
    const rateLimitKey = this.getRateLimitKey(email);
    const exists = await this.redis.exists(rateLimitKey);

    if (exists) {
      throw new BadRequestException('发送过于频繁，请稍后再试');
    }

    // 生成并发送验证码
    const token = await this.generateVerificationToken(email);
    await this.emailService.sendVerificationEmail(email, token);

    // 设置频率限制，配置的时间内不能重复发送
    await this.redis.setex(rateLimitKey, this.rateLimitTTL, '1');
  }

  async verifyEmail(email: string, code: string): Promise<boolean> {
    const key = this.getCodeKey(email);
    const storedCode = await this.redis.get(key);

    if (!storedCode) {
      throw new BadRequestException('验证码无效或已过期');
    }

    if (storedCode !== code) {
      throw new BadRequestException('验证码错误');
    }

    // 验证成功后删除验证码
    await this.redis.del(key);

    return true;
  }

  async resendVerificationEmail(email: string): Promise<void> {
    await this.sendVerificationEmail(email);
  }
}
