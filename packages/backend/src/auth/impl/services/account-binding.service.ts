import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WechatService } from './wechat.service';
import { AuthTokenService } from './auth-token.service';
import type { IUserRepository, IEmailVerificationService, ISmsVerificationService, IRuntimeConfigService, IAccountBindingService, WechatBindResponseDto, WechatUnbindResponseDto } from '@cloudcad/contracts';
import { USER_REPOSITORY } from '@cloudcad/contracts';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class AccountBindingService implements IAccountBindingService {
  private readonly logger = new Logger(AccountBindingService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('EMAIL') private readonly emailVerificationService: IEmailVerificationService,
    @Inject('SMS') private readonly smsVerificationService: ISmsVerificationService,
    private wechatService: WechatService,
    @Inject('CONFIG') private readonly runtimeConfigService: IRuntimeConfigService,
    private authTokenService: AuthTokenService
  ) {}

  async sendBindEmailCode(userId: string, email: string, isRebind: boolean = false): Promise<{ message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled') ?? '邮件服务未启用，无法绑定邮箱'); }

    if (!isRebind) {
      const user = await this.userRepo.findById(userId);
      if (user?.email) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_already_bound') ?? '您已绑定邮箱，如需更换请联系管理员'); }
    }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) { throw new ConflictException(I18nContext.current()?.t('error.account_binding.email_conflict') ?? '该邮箱已被其他用户绑定'); }

    try {
      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`绑定邮箱验证码已发送: ${email}`);
      return { message: I18nContext.current()?.t('success.email_bind_sent') ?? '验证码已发送到您的邮箱' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送绑定邮箱验证码失败: ${err.message}`);
      throw new InternalServerErrorException(I18nContext.current()?.t('error.auth.send_code_failed') ?? '发送验证码失败，请稍后重试');
    }
  }

  async verifyBindEmail(userId: string, email: string, code: string, isRebind: boolean = false): Promise<{ message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled') ?? '邮件服务未启用，无法绑定邮箱'); }

    if (!isRebind) {
      const user = await this.userRepo.findById(userId);
      if (user?.email) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_already_bound') ?? '您已绑定邮箱，如需更换请联系管理员'); }
    }

    const result = await this.emailVerificationService.verifyEmail(email, code);
    // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
    if (!result.valid) { throw new BadRequestException(result.message); }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser && existingUser.id !== userId) { throw new ConflictException(I18nContext.current()?.t('error.account_binding.email_conflict') ?? '该邮箱已被其他用户绑定'); }

    await this.userRepo.markEmailVerified(userId, email);

    this.logger.log(`邮箱绑定成功: userId=${userId}, email=${email}`);
    return { message: I18nContext.current()?.t('success.email_bind_success') ?? '邮箱绑定成功' };
  }

  async bindPhone(userId: string, phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
    if (!verifyResult.valid) { throw new BadRequestException(verifyResult.message); }

    const formattedPhone = phone.replace(/^\+86/, '');
    const existingUser = await this.userRepo.findByPhone(formattedPhone);
    if (existingUser && existingUser.id !== userId) { throw new ConflictException(I18nContext.current()?.t('error.account_binding.phone_conflict') ?? '该手机号已被其他用户绑定'); }

    const user = await this.userRepo.findById(userId);
    const isReplacing = !!user?.phone;

    await this.userRepo.markPhoneVerified(userId, formattedPhone);

    this.logger.log(`手机号${isReplacing ? '换绑' : '绑定'}成功: userId=${userId}, phone=${formattedPhone}`);
    return { success: true, message: I18nContext.current()?.t('success.phone_bind_success') ?? '手机号绑定成功' };
  }

  async sendUnbindPhoneCode(userId: string): Promise<{ success: boolean; message: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>('smsEnabled', false);
    if (!smsEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.sms_service_disabled') ?? '短信服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user?.phone) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.phone_not_bound') ?? '您还未绑定手机号'); }

    try {
      await this.smsVerificationService.sendVerificationCode(user.phone);
      this.logger.log(`换绑验证码已发送：userId=${userId}, phone=${user.phone}`);
      return { success: true, message: I18nContext.current()?.t('success.phone_rebind_code_sent') ?? '验证码已发送到原手机号' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送换绑验证码失败：${err.message}`);
      throw new InternalServerErrorException(I18nContext.current()?.t('error.auth.send_code_failed') ?? '发送验证码失败，请稍后重试');
    }
  }

  async verifyUnbindPhoneCode(userId: string, code: string): Promise<{ success: boolean; message: string; token: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>('smsEnabled', false);
    if (!smsEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.sms_service_disabled') ?? '短信服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user?.phone) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.phone_not_bound') ?? '您还未绑定手机号'); }

    const verifyResult = await this.smsVerificationService.verifyCode(user.phone, code);
    if (!verifyResult.valid) { throw new BadRequestException(verifyResult.message); }

    const token = await this.jwtService.signAsync(
      { userId, phone: user.phone, type: 'unbind-phone' },
      { secret: this.configService.get<string>('jwt.secret'), expiresIn: '5m' }
    );

    this.logger.log(`换绑验证码验证通过：userId=${userId}`);
    return { success: true, message: I18nContext.current()?.t('success.phone_rebind_verified') ?? '验证通过', token };
  }

  async rebindPhone(userId: string, phone: string, code: string, token: string): Promise<{ success: boolean; message: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>('smsEnabled', false);
    if (!smsEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.sms_service_disabled') ?? '短信服务未启用'); }

    try {
      const payload = this.jwtService.verify(token, { secret: this.configService.get<string>('jwt.secret') }) as { userId: string; type: string };
      if (payload.type !== 'unbind-phone' || payload.userId !== userId) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.verify_token_invalid') ?? '验证 token 无效'); }
    } catch (error) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.verify_token_expired') ?? '验证 token 无效或已过期');
    }

    const verifyResult = await this.smsVerificationService.verifyCode(phone, code);
    if (!verifyResult.valid) { throw new BadRequestException(verifyResult.message); }

    const formattedPhone = phone.replace(/^\+86/, '');
    const existingUser = await this.userRepo.findByPhone(formattedPhone);
    if (existingUser && existingUser.id !== userId) { throw new ConflictException(I18nContext.current()?.t('error.account_binding.phone_conflict') ?? '该手机号已被其他用户绑定'); }

    await this.userRepo.markPhoneVerified(userId, formattedPhone);

    this.logger.log(`手机号换绑成功：userId=${userId}, phone=${formattedPhone}`);
    return { success: true, message: I18nContext.current()?.t('success.phone_rebind_success') ?? '手机号换绑成功' };
  }

  async sendUnbindEmailCode(userId: string): Promise<{ success: boolean; message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled_general') ?? '邮件服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user?.email) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_not_bound') ?? '您还未绑定邮箱'); }

    try {
      await this.emailVerificationService.sendVerificationEmail(user.email);
      this.logger.log(`邮箱换绑验证码已发送：userId=${userId}, email=${user.email}`);
      return { success: true, message: I18nContext.current()?.t('success.email_rebind_code_sent') ?? '验证码已发送到原邮箱' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送邮箱换绑验证码失败：${err.message}`);
      throw new InternalServerErrorException(I18nContext.current()?.t('error.auth.send_code_failed') ?? '发送验证码失败，请稍后重试');
    }
  }

  async verifyUnbindEmailCode(userId: string, code: string): Promise<{ success: boolean; message: string; token: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled_general') ?? '邮件服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user?.email) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_not_bound') ?? '您还未绑定邮箱'); }

    const result = await this.emailVerificationService.verifyEmail(user.email, code);
    // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
    if (!result.valid) { throw new BadRequestException(result.message); }

    const token = await this.jwtService.signAsync(
      { userId, email: user.email, type: 'unbind-email' },
      { secret: this.configService.get<string>('jwt.secret'), expiresIn: '5m' }
    );

    this.logger.log(`邮箱换绑验证码验证通过：userId=${userId}`);
    return { success: true, message: I18nContext.current()?.t('success.email_rebind_verified') ?? '验证通过', token };
  }

  async rebindEmail(userId: string, email: string, code: string, token: string): Promise<{ success: boolean; message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled_general') ?? '邮件服务未启用'); }

    try {
      const payload = this.jwtService.verify(token, { secret: this.configService.get<string>('jwt.secret') }) as { userId: string; type: string };
      if (payload.type !== 'unbind-email' || payload.userId !== userId) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.verify_token_invalid') ?? '验证 token 无效'); }
    } catch (error) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.verify_token_expired') ?? '验证 token 无效或已过期');
    }

    await this.verifyBindEmail(userId, email, code, true);
    this.logger.log(`邮箱换绑成功：userId=${userId}, email=${email}`);
    return { success: true, message: I18nContext.current()?.t('success.email_rebind_success') ?? '邮箱换绑成功' };
  }

  async bindWechat(
    userId: string,
    code: string,
    state: string,
    takeover: boolean = false
  ): Promise<WechatBindResponseDto> {
    if (!this.wechatService.validateState(state)) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.invalid_state_param') ?? '无效的状态参数'); }
    const tokenData = await this.wechatService.getAccessToken(code);
    const openid = tokenData.openid;

    if (!openid) {
      this.logger.warn('[wechat bind] 微信授权响应缺少 openid，拒绝绑定');
      throw new BadRequestException('授权失败：缺少 openid');
    }

    const existingUser = await this.userRepo.findByWechatId(openid);
    if (existingUser && existingUser.id !== userId) {
      // 该微信已绑定其他账号：默认拒绝；takeover=true 且旧账号还有其他登录方式时
      // 允许接管（清空旧账号 wechatId，openid 迁到当前账号）——典型场景是用户
      // 解绑后微信登录自动注册了新账号（wechatAutoRegister），原账号重新绑定。
      // 旧账号仅微信一种登录方式时拒绝，避免接管后旧账号彻底无法登录。
      const oldHasOtherLogin =
        !!existingUser.password ||
        !!existingUser.email ||
        !!existingUser.phone;
      if (!takeover || !oldHasOtherLogin) {
        throw new ConflictException(
          oldHasOtherLogin
            ? (I18nContext.current()?.t('error.auth.wechat_already_bound') ??
              '该微信已绑定其他账号')
            : (I18nContext.current()?.t('error.auth.wechat_takeover_not_allowed') ??
              '该微信绑定的账号仅支持微信登录，无法转移绑定')
        );
      }

      await this.userRepo.update(existingUser.id, {
        wechatId: null,
        provider: 'LOCAL',
      } as any);
      this.logger.warn(
        `[wechat bind] 接管绑定: openid=${openid} 从用户 ${existingUser.id}(${existingUser.username}) 迁移到用户 ${userId}`
      );
    }

    await this.userRepo.update(userId, { wechatId: openid, provider: 'WECHAT' } as any);
    this.logger.log(`微信绑定成功: 用户ID ${userId}, openid: ${openid}`);
    return { success: true, message: I18nContext.current()?.t('success.wechat_bind_success') ?? '微信绑定成功' };
  }

  async unbindWechat(userId: string): Promise<WechatUnbindResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) { throw new BadRequestException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'); }
    if (!user.wechatId) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.wechat_not_bound') ?? '未绑定微信'); }

    const hasPassword = !!user.password;
    const hasEmail = !!user.email;
    const hasPhone = !!user.phone;
    if (!hasPassword && !hasEmail && !hasPhone) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.keep_one_login_method_password_email_phone') ?? '至少需要保留一种登录方式（设置密码、绑定邮箱或绑定手机）');
    }

    await this.userRepo.update(userId, { wechatId: null, provider: hasEmail || hasPhone || hasPassword ? 'LOCAL' : 'WECHAT' } as any);
    this.logger.log(`微信解绑成功: 用户ID ${userId}`);
    return { success: true, message: I18nContext.current()?.t('success.wechat_unbound') ?? '微信解绑成功' };
  }

  async unbindEmail(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);
    if (!mailEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_service_disabled_general') ?? '邮件服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user) { throw new BadRequestException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'); }
    if (!user.email) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.email_not_bound') ?? '您还未绑定邮箱'); }

    // 解绑前必须验证原邮箱验证码，防止账号被攻破后静默移除登录方式
    // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
    const result = await this.emailVerificationService.verifyEmail(user.email, code);
    if (!result.valid) { throw new BadRequestException(result.message); }

    const hasPassword = !!user.password;
    const hasPhone = !!user.phone;
    const hasWechat = !!user.wechatId;
    if (!hasPassword && !hasPhone && !hasWechat) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.keep_one_login_method_password_phone_wechat') ?? '至少需要保留一种登录方式（设置密码、绑定手机或绑定微信）');
    }

    await this.userRepo.update(userId, { email: null, emailVerified: false, emailVerifiedAt: null } as any);
    this.logger.log(`邮箱解绑成功: 用户ID ${userId}`);
    return { success: true, message: I18nContext.current()?.t('success.email_unbound') ?? '邮箱解绑成功' };
  }

  async unbindPhone(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>('smsEnabled', false);
    if (!smsEnabled) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.sms_service_disabled') ?? '短信服务未启用'); }

    const user = await this.userRepo.findById(userId);
    if (!user) { throw new BadRequestException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'); }
    if (!user.phone) { throw new BadRequestException(I18nContext.current()?.t('error.account_binding.phone_not_bound') ?? '您还未绑定手机号'); }

    // 解绑前必须验证原手机号验证码，防止账号被攻破后静默移除登录方式
    const verifyResult = await this.smsVerificationService.verifyCode(user.phone, code);
    if (!verifyResult.valid) { throw new BadRequestException(verifyResult.message); }

    const hasPassword = !!user.password;
    const hasEmail = !!user.email;
    const hasWechat = !!user.wechatId;
    if (!hasPassword && !hasEmail && !hasWechat) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.keep_one_login_method_password_email_wechat') ?? '至少需要保留一种登录方式（设置密码、绑定邮箱或绑定微信）');
    }

    await this.userRepo.update(userId, { phone: null, phoneVerified: false, phoneVerifiedAt: null } as any);
    this.logger.log(`手机号解绑成功: 用户ID ${userId}`);
    return { success: true, message: I18nContext.current()?.t('success.phone_unbound') ?? '手机号解绑成功' };
  }

  async checkFieldUniqueness(dto: { username?: string; email?: string; phone?: string }): Promise<{ usernameExists: boolean; emailExists: boolean; phoneExists: boolean }> {
    const result = { usernameExists: false, emailExists: false, phoneExists: false };
    if (!dto) return result;

    if (dto.username) {
      const user = await this.userRepo.findByUsername(dto.username);
      result.usernameExists = !!user;
    }
    if (dto.email) {
      const user = await this.userRepo.findByEmail(dto.email);
      result.emailExists = !!user;
    }
    if (dto.phone) {
      const formattedPhone = dto.phone.replace(/^\+86/, '');
      const user = await this.userRepo.findByPhone(formattedPhone);
      result.phoneExists = !!user;
    }
    return result;
  }
}
