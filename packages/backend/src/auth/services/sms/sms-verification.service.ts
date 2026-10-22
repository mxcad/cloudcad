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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import {
  SmsProvider,
  SmsProviderConfig,
} from './interfaces/sms-provider.interface';
import { SmsProviderFactory, MockSmsProvider } from './providers';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';
import { VerificationCodeStore } from '../../../common/verification-code.store';

import { I18nContext } from 'nestjs-i18n';
import type { ISmsVerificationService } from '@cloudcad/contracts';
/**
 * 验证码验证限制配置
 */
interface SmsVerifyLimitsConfig {
  /** 最大验证尝试次数 */
  maxVerifyAttempts: number;
}

/**
 * 短信验证服务
 *
 * 提供短信验证码的发送和验证功能
 *
 * 安全限制：
 * - 发送频率限制：同一手机号 60 秒内只能发送 1 次
 * - 每日发送上限：同一手机号每天最多发送 N 次（默认 10 次）
 * - IP 限制：同一 IP 每小时最多发送 N 次（默认 20 次）
 */
@Injectable()
export class SmsVerificationService implements ISmsVerificationService {
  private readonly logger = new Logger(SmsVerificationService.name);

  private provider: SmsProvider | null = null;
  /** 当前生效短信配置的指纹（ADR-0082 #502）；变化即热重建 provider */
  private providerFingerprint: string | null = null;

  private readonly codeTTL: number;
  private readonly rateLimitTTL: number;
  private readonly verifyLimits: SmsVerifyLimitsConfig;
  private readonly codeStore: VerificationCodeStore;

  constructor(
    private readonly configService: ConfigService,
    private readonly runtimeConfigService: RuntimeConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {
    // 验证码生成/存储/原子验证走共享 VerificationCodeStore（架构审查 ⑥）
    this.codeStore = new VerificationCodeStore(this.redis);
    const cacheTTL = this.configService.get('cacheTTL');

    // 有效期与限流周期一律取 configuration.ts 的默认值（900s / 60s），这里不再各自兜底：
    // 历史上 SMS 兜底写成 300，与配置中心悄悄差 3 倍，运维只改 .env 却以为没生效（Gitea #483）
    this.codeTTL = cacheTTL.verificationCode;
    this.rateLimitTTL = cacheTTL.verificationRateLimit;

    // 设置验证限制（默认最多尝试 5 次）
    const smsVerifyConfig = this.configService.get<{
      verifyLimits?: SmsVerifyLimitsConfig;
    }>('sms');
    this.verifyLimits = smsVerifyConfig?.verifyLimits ?? {
      maxVerifyAttempts: 5,
    };

    // 每日/每小时发送上限在 sendCode 里每次调用时读运行时配置，
    // 构造期不打印这类值——启动时打印只会报告 env 快照，与配置页的实际生效值不符。
    this.logger.log(
      `短信验证最多${this.verifyLimits.maxVerifyAttempts}次`
    );
  }

  /**
   * 获取短信服务商（ADR-0082 #502 指纹热重建）
   *
   * 每次调用按三层解析（runtime > env > 默认）取 smsEnabled + smsProvider
   * + 所选服务商凭据键，拼指纹；指纹变化即重建 provider，配置页改完即生效。
   * 关闭 / 所选服务商凭据缺失时回落 Mock 模式（与旧行为一致）。
   */
  private async getProvider(): Promise<SmsProvider> {
    const [smsEnabled, providerName] = await Promise.all([
      this.runtimeConfigService.getValue<boolean>('smsEnabled'),
      this.runtimeConfigService.getValue<string>('smsProvider'),
    ]);

    let aliyun: SmsProviderConfig['aliyun'] | undefined;
    let tencent: SmsProviderConfig['tencent'] | undefined;

    if (providerName === 'aliyun') {
      const [accessKeyId, accessKeySecret, signName, templateCode, regionId] =
        await Promise.all([
          this.runtimeConfigService.getValue<string>('aliyunSmsAccessKeyId'),
          this.runtimeConfigService.getValue<string>('aliyunSmsAccessKeySecret'),
          this.runtimeConfigService.getValue<string>('aliyunSmsSignName'),
          this.runtimeConfigService.getValue<string>('aliyunSmsTemplateCode'),
          this.runtimeConfigService.getValue<string>('aliyunSmsRegionId'),
        ]);
      aliyun = { accessKeyId, accessKeySecret, signName, templateCode, regionId };
    } else if (providerName === 'tencent') {
      const [secretId, secretKey, appId, signName, templateId, region] =
        await Promise.all([
          this.runtimeConfigService.getValue<string>('tencentSmsSecretId'),
          this.runtimeConfigService.getValue<string>('tencentSmsSecretKey'),
          this.runtimeConfigService.getValue<string>('tencentSmsAppId'),
          this.runtimeConfigService.getValue<string>('tencentSmsSignName'),
          this.runtimeConfigService.getValue<string>('tencentSmsTemplateCode'),
          this.runtimeConfigService.getValue<string>('tencentSmsRegion'),
        ]);
      tencent = { secretId, secretKey, appId, signName, templateId, region };
    }

    const fingerprint = JSON.stringify([
      smsEnabled,
      providerName,
      aliyun,
      tencent,
    ]);
    if (fingerprint === this.providerFingerprint) {
      return this.provider!;
    }

    if (!smsEnabled) {
      this.provider = new MockSmsProvider();
      this.logger.log('短信服务未启用（运行时配置），使用 Mock 模式');
    } else if (providerName === 'mock') {
      this.provider = new MockSmsProvider();
      this.logger.log('短信服务已启用，使用 Mock 模式（开发测试）');
    } else {
      const hasCredentials =
        providerName === 'aliyun'
          ? !!(aliyun?.accessKeyId && aliyun?.accessKeySecret)
          : !!(tencent?.secretId && tencent?.secretKey);

      if (!hasCredentials) {
        this.provider = new MockSmsProvider();
        this.logger.warn(
          `短信服务已启用但 ${providerName} 凭据缺失，使用 Mock 模式`
        );
      } else {
        this.provider = SmsProviderFactory.create({
          // 走到这里 providerName 必为 'aliyun' | 'tencent'（'mock' 已在上分支处理）
          provider: providerName as SmsProviderConfig['provider'],
          aliyun,
          tencent,
        });
        this.logger.log(`短信服务已启用，使用 ${this.provider.name} 服务商`);
      }
    }

    this.providerFingerprint = fingerprint;
    return this.provider;
  }

  /**
   * 获取验证码存储 Key
   */
  private getCodeKey(phone: string): string {
    return `sms_verification:code:${phone}`;
  }

  /**
   * 获取频率限制 Key（60秒内只能发1次）
   */
  private getRateLimitKey(phone: string): string {
    return `sms_verification:rate_limit:${phone}`;
  }

  /**
   * 获取每日发送次数 Key
   */
  private getDailyCountKey(phone: string): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `sms_verification:daily_count:${phone}:${today}`;
  }

  /**
   * 获取 IP 每小时发送次数 Key
   */
  private getIpHourlyCountKey(ip: string): string {
    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    return `sms_verification:ip_hourly_count:${ip}:${hour}`;
  }

  /**
   * 获取验证尝试次数 Key
   */
  private getVerifyAttemptsKey(phone: string): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `sms_verification:verify_attempts:${phone}:${today}`;
  }

  /**
   * 验证手机号格式
   */
  private validatePhone(phone: string): boolean {
    // 中国大陆手机号：11位数字，以1开头
    const phoneRegex = /^1[3-9]\d{9}$/;
    // 或者带国际区号的格式：+86开头
    const internationalRegex = /^\+86\s*1[3-9]\d{9}$/;

    return phoneRegex.test(phone) || internationalRegex.test(phone);
  }

  /**
   * 格式化手机号（统一为中国大陆格式）
   */
  private formatPhone(phone: string): string {
    // 移除空格和 +86 前缀，然后重新添加
    const cleaned = phone.replace(/\s/g, '').replace(/^\+86/, '');
    return `+86${cleaned}`;
  }

  /**
   * 发送验证码
   *
   * @param phone 手机号
   * @param clientIp 客户端 IP 地址
   * @returns 发送结果
   */
  async sendVerificationCode(
    phone: string,
    clientIp?: string
  ): Promise<{ success: boolean; message: string }> {
    // 验证手机号格式
    if (!this.validatePhone(phone)) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.phone_format_invalid') ?? '手机号格式不正确');
    }

    const formattedPhone = this.formatPhone(phone);

    // 1. 检查发送频率限制（60秒内只能发1次）
    const rateLimitKey = this.getRateLimitKey(formattedPhone);
    const rateExists = await this.redis.exists(rateLimitKey);

    if (rateExists) {
      const ttl = await this.redis.ttl(rateLimitKey);
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.send_too_frequent_with_ttl', { args: { ttl } }) ?? `发送过于频繁，请${ttl}秒后再试`);
    }

    // 2. 检查每日发送上限
    const dailyCountKey = this.getDailyCountKey(formattedPhone);
    const dailyCount = parseInt(
      (await this.redis.get(dailyCountKey)) || '0',
      10
    );

    // 发送上限走运行时配置（每调用读取，改完即生效）。
    // 兜底值与 definition 的 defaultValue 一致，DB 不可达时的降级语义由
    // RuntimeConfigService.getValue 统一处理。
    const dailyLimitPerPhone = await this.runtimeConfigService.getValue<number>(
      'smsDailyLimitPerPhone',
      10
    );

    if (dailyCount >= dailyLimitPerPhone) {
      throw new BadRequestException(
        `该手机号今日发送次数已达上限（${dailyLimitPerPhone}次），请明天再试`
      );
    }

    // 3. 检查 IP 每小时发送上限
    if (clientIp) {
      const ipCountKey = this.getIpHourlyCountKey(clientIp);
      const ipCount = parseInt((await this.redis.get(ipCountKey)) || '0', 10);
      const hourlyLimitPerIp =
        await this.runtimeConfigService.getValue<number>(
          'smsHourlyLimitPerIp',
          20
        );

      if (ipCount >= hourlyLimitPerIp) {
        throw new BadRequestException(I18nContext.current()?.t('error.sms_extra.network_limit') ?? `当前网络发送次数已达上限，请稍后再试`);
      }
    }

    // 生成 6 位数字验证码（共享 VerificationCodeStore）
    const code = this.codeStore.generateCode();

    // 存储验证码到 Redis
    const codeKey = this.getCodeKey(formattedPhone);
    await this.codeStore.storeCode(codeKey, code, this.codeTTL);

    // 设置频率限制
    await this.redis.setex(rateLimitKey, this.rateLimitTTL, '1');

    // 增加每日发送计数（有效期到当天结束）
    const secondsUntilMidnight = this.getSecondsUntilMidnight();
    const currentDailyCount = await this.redis.incr(dailyCountKey);
    if (currentDailyCount === 1) {
      await this.redis.expire(dailyCountKey, secondsUntilMidnight);
    }

    // 增加 IP 每小时发送计数
    if (clientIp) {
      const ipCountKey = this.getIpHourlyCountKey(clientIp);
      const currentIpCount = await this.redis.incr(ipCountKey);
      if (currentIpCount === 1) {
        await this.redis.expire(ipCountKey, 3600); // 1 小时
      }
    }

    // 获取短信服务商并发送短信
    const provider = await this.getProvider();
    const result = await provider.sendVerificationCode(formattedPhone, code);

    if (result.success) {
      this.logger.log(
        `验证码发送成功: ${formattedPhone}, 今日第${currentDailyCount}次, IP=${clientIp || 'unknown'}`
      );
      return { success: true, message: I18nContext.current()?.t('success.verification_code_sent') ?? '验证码已发送' };
    } else {
      this.logger.warn(
        `验证码发送失败: ${formattedPhone}, 原因: ${result.message}`
      );
      // 发送失败时清理 Redis 中的验证码和计数
      await this.redis.del(codeKey);
      await this.redis.del(rateLimitKey);
      await this.redis.decr(dailyCountKey);
      if (clientIp) {
        await this.redis.decr(this.getIpHourlyCountKey(clientIp));
      }
      return {
        success: false,
        message: result.message || (I18nContext.current()?.t('error.sms_extra.send_failed_retry') ?? '发送失败，请稍后重试'),
      };
    }
  }

  /**
   * 获取到午夜的秒数
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  /**
   * 验证验证码
   *
   * @param phone 手机号
   * @param code 验证码
   * @returns 验证结果
   */
  async verifyCode(
    phone: string,
    code: string
  ): Promise<{
    valid: boolean;
    message: string;
    remainingAttempts?: number;
    expiresIn?: number;
  }> {
    if (!this.validatePhone(phone)) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.phone_format_invalid') ?? '手机号格式不正确');
    }

    const formattedPhone = this.formatPhone(phone);
    const codeKey = this.getCodeKey(formattedPhone);
    const attemptsKey = this.getVerifyAttemptsKey(formattedPhone);

    // 验证码核心逻辑（原子 incr 计数 / 删码 / TTL 对齐）走共享 VerificationCodeStore，
    // 本方法只负责 phone 校验、key 生成与 status→对外契约的 i18n 翻译（架构审查 ⑥）
    const result = await this.codeStore.verifyCode({
      codeKey,
      attemptsKey,
      code,
      maxVerifyAttempts: this.verifyLimits.maxVerifyAttempts,
    });

    if (result.status === 'valid') {
      this.logger.log(`验证码验证成功: ${formattedPhone}`);
      return {
        valid: true,
        message: I18nContext.current()?.t('success.verification_success') ?? '验证成功',
        expiresIn: result.expiresIn,
      };
    }

    if (result.status === 'expired') {
      return { valid: false, message: I18nContext.current()?.t('success.verification_code_expired') ?? '验证码已过期，请重新获取' };
    }

    if (result.status === 'exhausted') {
      return { valid: false, message: I18nContext.current()?.t('error.auth.verification_attempts_exhausted') ?? '验证次数已用完，请重新获取验证码' };
    }

    // status === 'wrong'
    const remainingAttempts = result.remainingAttempts ?? 0;
    this.logger.log(`验证码验证失败: ${formattedPhone}, 剩余尝试次数: ${remainingAttempts}`);
    return {
      valid: false,
      message: I18nContext.current()?.t('success.verification_code_error_remaining', { args: { count: remainingAttempts } }) ?? `验证码错误，剩余 ${remainingAttempts} 次尝试机会`,
      remainingAttempts,
    };
  }

  /**
   * 发送模板短信
   *
   * @param phone 手机号
   * @param templateId 模板ID
   * @param params 模板参数
   * @returns 发送结果
   */
  async sendTemplate(
    phone: string,
    templateId: string,
    params: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    if (!this.validatePhone(phone)) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.phone_format_invalid') ?? '手机号格式不正确');
    }

    const formattedPhone = this.formatPhone(phone);
    const provider = await this.getProvider();
    const result = await provider.sendTemplate(
      formattedPhone,
      templateId,
      params
    );

    return {
      success: result.success,
      message: result.success ? '短信发送成功' : result.message || '发送失败',
    };
  }

  /**
   * 检查短信服务是否启用
   */
  async isEnabled(): Promise<boolean> {
    return this.runtimeConfigService.getValue<boolean>('smsEnabled', false);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; provider: string }> {
    const provider = await this.getProvider();
    const isHealthy = await provider.healthCheck();
    return {
      healthy: isHealthy,
      provider: provider.name,
    };
  }
}
