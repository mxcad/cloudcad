import { Injectable, Logger, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service';
import * as bcrypt from 'bcryptjs';
import type { IUserRepository, IEmailVerificationService, ISmsVerificationService, IRuntimeConfigService, ITokenBlacklistService, IPasswordService } from '@cloudcad/contracts';
import { USER_REPOSITORY } from '@cloudcad/contracts';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class PasswordService implements IPasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject('EMAIL') private readonly emailVerificationService: IEmailVerificationService,
    @Inject('SMS') private readonly smsVerificationService: ISmsVerificationService,
    @Inject('CONFIG') private readonly runtimeConfigService: IRuntimeConfigService,
    private authTokenService: AuthTokenService,
    @Inject('TOKEN_BLACKLIST') private readonly tokenBlacklistService: ITokenBlacklistService,
    private accountRateLimitService: AccountRateLimitService,
    private passwordPolicyService: PasswordPolicyService
  ) {}

  async validateUser(email: string, password: string): Promise<Record<string, unknown> | null> {
    const user = await this.userRepo.findByEmail(email);
    if (user && user.status === 'ACTIVE') {
      // 无密码账号（微信注册等 password=null）：bcrypt.compare(hash=null) 会 reject
      // 抛异常 → 500，故按「密码错误」处理（返回 null，与错误密码同语义）
      const isPasswordValid = user.password
        ? await bcrypt.compare(password, user.password)
        : false;
      if (isPasswordValid) {
        const { password: _, ...result } = user;
        return result as any;
      }
    }
    return null;
  }

  async forgotPassword(email?: string, phone?: string): Promise<{
    message: string; mailEnabled: boolean; smsEnabled: boolean; supportEmail?: string; supportPhone?: string;
  }> {
    if (!email && !phone) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.email_or_phone_required') ?? '邮箱和手机号不能同时为空');
    }

    this.logger.log(`忘记密码请求：email=${email}, phone=${phone}`);

    // 账号维度限流（防枚举/验证码轰炸），与 IP 维度 RateLimitGuard 互补
    if (email) {
      await this.accountRateLimitService.checkLimit('password_reset', email);
    } else if (phone) {
      await this.accountRateLimitService.checkLimit('password_reset', phone);
    }

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>('smsEnabled', false);

    if (!mailEnabled && !smsEnabled) {
      const supportEmail = await this.runtimeConfigService.getValue<string>('supportEmail', '');
      const supportPhone = await this.runtimeConfigService.getValue<string>('supportPhone', '');
      return { message: I18nContext.current()?.t('success.password_reset_email_service_disabled') ?? '邮件服务和短信服务均未启用，请联系客服重置密码', mailEnabled: false, smsEnabled: false, supportEmail, supportPhone };
    }

    if (email) {
      if (!mailEnabled) {
        const supportEmail = await this.runtimeConfigService.getValue<string>('supportEmail', '');
        const supportPhone = await this.runtimeConfigService.getValue<string>('supportPhone', '');
        return { message: I18nContext.current()?.t('success.password_reset_email_disabled') ?? '邮件服务未启用，无法使用邮箱重置密码，请联系客服', mailEnabled: false, smsEnabled, supportEmail, supportPhone };
      }

      const user = await this.userRepo.findByEmail(email);
      if (user && user.status === 'ACTIVE') {
        await this.emailVerificationService.sendVerificationEmail(email);
        this.logger.log(`密码重置验证码已发送：${email}`);
      } else {
        // 防账号枚举：账号不存在/已禁用时不发送验证码，但返回相同的成功消息
        this.logger.warn(`忘记密码：邮箱账号不存在或不可用，不发送验证码 (email=${email})`);
      }

      return { message: I18nContext.current()?.t('success.password_reset_code_sent_email') ?? '密码重置验证码已发送到您的邮箱', mailEnabled: true, smsEnabled };
    }

    if (phone) {
      if (!smsEnabled) {
        const supportEmail = await this.runtimeConfigService.getValue<string>('supportEmail', '');
        const supportPhone = await this.runtimeConfigService.getValue<string>('supportPhone', '');
        return { message: I18nContext.current()?.t('success.password_reset_sms_disabled') ?? '短信服务未启用，无法使用手机号重置密码，请联系客服', mailEnabled, smsEnabled: false, supportEmail, supportPhone };
      }

      const user = await this.userRepo.findByPhone(phone);
      if (user && user.status === 'ACTIVE') {
        await this.smsVerificationService.sendVerificationCode(phone);
        this.logger.log(`密码重置验证码已发送：${phone}`);
      } else {
        // 防账号枚举：账号不存在/已禁用时不发送验证码，但返回相同的成功消息
        this.logger.warn(`忘记密码：手机号账号不存在或不可用，不发送验证码 (phone=${phone})`);
      }

      return { message: I18nContext.current()?.t('success.password_reset_code_sent_sms') ?? '密码重置验证码已发送到您的手机', mailEnabled, smsEnabled: true };
    }

    throw new BadRequestException(I18nContext.current()?.t('error.auth.email_or_phone_required') ?? '邮箱和手机号不能同时为空');
  }

  async resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{ message: string }> {
    this.logger.log(`重置密码请求：email=${email}, phone=${phone}`);

    let user;
    if (email) {
      const result = await this.emailVerificationService.verifyEmail(email, code);
      if (!result.valid) {
        this.logger.error(`验证码验证失败：${email}，${result.message}`);
        throw new UnauthorizedException(result.message);
      }
      user = await this.userRepo.findByEmail(email);
    } else if (phone) {
      const result = await this.smsVerificationService.verifyCode(phone, code);
      if (!result.valid) {
        this.logger.error(`验证码验证失败：${phone}，${result.message}`);
        throw new UnauthorizedException(result.message);
      }
      user = await this.userRepo.findByPhone(phone);
    }

    if (!user) { throw new UnauthorizedException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'); }

    // 口令策略校验（#416 等保 8.1.4.1 a)/b)）：复杂度 + 弱口令黑名单
    this.passwordPolicyService.assertPasswordPolicy(newPassword);

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    // 记录口令修改时间（#416）
    await this.userRepo.update(user.id, { password: hashedPassword, passwordChangedAt: new Date() } as any);
    await this.authTokenService.deleteAllRefreshTokens(user.id);
    await this.tokenBlacklistService.removeUserFromBlacklist(user.id);

    this.logger.log(`密码重置成功：email=${email ?? phone}`);
    return { message: I18nContext.current()?.t('success.password_reset_success') ?? '密码重置成功，请使用新密码登录' };
  }
}
