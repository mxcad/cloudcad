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

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

import { I18nContext } from 'nestjs-i18n';
import type { IEmailVerificationService } from '@cloudcad/contracts';
import { AppConfig } from '../config/app.config';
import { VerificationCodeStore } from '../common/verification-code.store';
@Injectable()
export class EmailVerificationService implements IEmailVerificationService {
  private readonly codeTTL: number;
  private readonly rateLimitTTL: number;
  private readonly maxVerifyAttempts: number;
  private readonly codeStore: VerificationCodeStore;

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService<AppConfig>,
    @InjectRedis() private readonly redis: Redis
  ) {
    // 验证码生成/存储/原子验证走共享 VerificationCodeStore（架构审查 ⑥）
    this.codeStore = new VerificationCodeStore(this.redis);
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.codeTTL = cacheTTL.verificationCode;
    this.rateLimitTTL = cacheTTL.verificationRateLimit;
    this.maxVerifyAttempts = 5;
  }

  private getCodeKey(email: string): string {
    return `email_verification:code:${email}`;
  }

  private getRateLimitKey(email: string): string {
    return `email_verification:rate_limit:${email}`;
  }

  private getVerifyAttemptsKey(email: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `email_verification:verify_attempts:${email}:${today}`;
  }

  private async generateVerificationToken(email: string): Promise<string> {
    const code = this.codeStore.generateCode();

    const key = this.getCodeKey(email);
    await this.codeStore.storeCode(key, code, this.codeTTL);
    return code;
  }

  async sendVerificationEmail(email: string): Promise<void> {
    const rateLimitKey = this.getRateLimitKey(email);
    const exists = await this.redis.exists(rateLimitKey);

    if (exists) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.send_too_frequent') ?? '发送过于频繁，请稍后再试');
    }

    const token = await this.generateVerificationToken(email);
    await this.emailService.sendVerificationEmail(email, token);

    await this.redis.setex(rateLimitKey, this.rateLimitTTL, '1');
  }

  async verifyEmail(
    email: string,
    code: string
  ): Promise<{ valid: boolean; message: string; remainingAttempts?: number }> {
    const key = this.getCodeKey(email);
    const attemptsKey = this.getVerifyAttemptsKey(email);
    const rateLimitKey = this.getRateLimitKey(email);

    // 验证码核心逻辑（原子 incr 计数 / 删码 / TTL 对齐）走共享 VerificationCodeStore，
    // 本方法只负责 key 生成与 status→对外契约的 i18n 翻译（架构审查 ⑥）
    const result = await this.codeStore.verifyCode({
      codeKey: key,
      attemptsKey,
      code,
      maxVerifyAttempts: this.maxVerifyAttempts,
    });

    if (result.status === 'valid') {
      // 邮箱特有：验证成功后清除发送频率限制
      await this.redis.del(rateLimitKey);
      return { valid: true, message: I18nContext.current()?.t('success.verification_success') ?? '验证成功' };
    }

    if (result.status === 'expired') {
      return { valid: false, message: I18nContext.current()?.t('error.auth.verification_code_invalid') ?? '验证码无效或已过期' };
    }

    if (result.status === 'exhausted') {
      return { valid: false, message: I18nContext.current()?.t('error.auth.verification_attempts_exhausted') ?? '验证次数已用完，请重新获取验证码' };
    }

    // status === 'wrong'
    const remainingAttempts = result.remainingAttempts ?? 0;
    return {
      valid: false,
      message:
        I18nContext.current()?.t('success.verification_code_error_remaining', {
          args: { count: remainingAttempts },
        }) ?? `验证码错误，剩余 ${remainingAttempts} 次尝试机会`,
      remainingAttempts,
    };
  }

  async resendVerificationEmail(email: string): Promise<void> {
    await this.sendVerificationEmail(email);
  }
}
