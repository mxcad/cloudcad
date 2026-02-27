import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class EmailVerificationService {
  private readonly CODE_TTL = 15 * 60; // 15分钟（秒）
  private readonly RATE_LIMIT_TTL = 60; // 1分钟（秒）

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {}

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

    // 存储到 Redis，15分钟过期
    const key = this.getCodeKey(email);
    await this.redis.setex(key, this.CODE_TTL, code);
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

    // 设置频率限制，1分钟内不能重复发送
    await this.redis.setex(rateLimitKey, this.RATE_LIMIT_TTL, '1');
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
