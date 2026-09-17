import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import type { IUserRepository, IEmailVerificationService, IRuntimeConfigService, IRegistrationService, IUserService, RegisterDto, AuthResponseDto, SessionRequest } from '@cloudcad/contracts';
import { USER_REPOSITORY } from '@cloudcad/contracts';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class RegistrationService implements IRegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('EMAIL') private readonly emailVerificationService: IEmailVerificationService,
    @Inject('CONFIG') private readonly runtimeConfigService: IRuntimeConfigService,
    @Inject('USER_SERVICE') private readonly userService: IUserService,
    private authTokenService: AuthTokenService,
    @InjectRedis() private readonly redis: Redis,
    private accountRateLimitService: AccountRateLimitService,
    private passwordPolicyService: PasswordPolicyService
  ) {}

  async register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto> {
    const { email, username, password, nickname, wechatTempToken } = registerDto;

    // 口令策略校验（#416 等保 8.1.4.1 a)/b)）：复杂度 + 弱口令黑名单
    this.passwordPolicyService.assertPasswordPolicy(password);

    const allowRegister = await this.runtimeConfigService.getValue<boolean>('allowRegister', true);
    if (!allowRegister) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.registration_disabled') ?? '系统已关闭注册功能');
    }

    // 账号维度限流（防批量注册/枚举探测），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('register', email || username);

    if (email) {
      const existingUserByEmail = await this.userRepo.findByEmail(email);
      if (existingUserByEmail) {
        // 防账号枚举：统一文案，不区分具体哪个账号字段已被占用
        throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
      }
    }

    const existingUserByUsername = await this.userRepo.findByUsername(username);
    if (existingUserByUsername) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    let wechatData: { wechatId: string; nickname: string; avatar: string } | null = null;
    if (wechatTempToken) {
      try {
        const payload = this.jwtService.verify(wechatTempToken, {
          secret: this.configService.get<string>('jwt.secret'),
        }) as { type: string; wechatId?: string; nickname?: string; avatar?: string };

        if (payload.type === 'wechat_temp' && payload.wechatId) {
          wechatData = {
            wechatId: payload.wechatId,
            nickname: payload.nickname || username,
            avatar: payload.avatar || '',
          };

          const existingWechatUser = await this.userRepo.findByWechatId(wechatData.wechatId);
          if (existingWechatUser) {
            // 防账号枚举：统一文案，不区分具体哪个账号字段已被占用
            throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
          }
        }
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        throw new BadRequestException(I18nContext.current()?.t('error.auth.wechat_token_invalid') ?? '无效的微信临时Token');
      }
    }

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);

    if (!mailEnabled) {
      const user = await this.userService.create({
        email: email || undefined,
        username,
        password,
        nickname: nickname || wechatData?.nickname || username,
        wechatId: wechatData?.wechatId,
        provider: wechatData ? 'WECHAT' : 'LOCAL',
      });

      this.logger.log(`用户直接注册成功（邮件服务未启用）: ${username}`);

      // 不预写微信 URL（页面 COEP=require-corp，前端直连微信头像域名必被拦，落库即永久无效）；
      // 落盘成功由 syncWechatAvatar 写入本地 URL，失败 avatar 保持空
      if (wechatData?.avatar) {
        await this.userService.syncWechatAvatar(user.id, wechatData.avatar);
      }

      const tokens = await this.authTokenService.generateTokens(user);

      if (req && req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role?.name || 'USER';
      }

      return { ...tokens, user: { ...user, role: user.role, status: user.status } };
    }

    const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>('requireEmailVerification', false);

    if (requireEmailVerification && !email) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.email_required_for_registration') ?? '邮箱验证已启用，注册需要提供邮箱地址');
    }

    if (!requireEmailVerification) {
      const user = await this.userService.create({
        email: email || undefined,
        username,
        password,
        nickname: nickname || wechatData?.nickname || username,
        wechatId: wechatData?.wechatId,
        provider: wechatData ? 'WECHAT' : 'LOCAL',
      });

      this.logger.log(`用户直接注册成功（无需邮箱验证）: ${username}`);

      // 不预写微信 URL（页面 COEP=require-corp，前端直连微信头像域名必被拦，落库即永久无效）；
      // 落盘成功由 syncWechatAvatar 写入本地 URL，失败 avatar 保持空
      if (wechatData?.avatar) {
        await this.userService.syncWechatAvatar(user.id, wechatData.avatar);
      }

      const tokens = await this.authTokenService.generateTokens(user);

      if (req && req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role?.name || 'USER';
      }

      return { ...tokens, user: { ...user, role: user.role, status: user.status } };
    }

    const registerKey = `register:pending:${email}`;
    await this.redis.setex(registerKey, 15 * 60, JSON.stringify({
      email, username, password,
      nickname: nickname || wechatData?.nickname || username,
      avatar: wechatData?.avatar,
      wechatId: wechatData?.wechatId,
      provider: wechatData ? 'WECHAT' : 'LOCAL',
    }));

    try {
      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`验证码已发送: ${email}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送验证码失败: ${err.message}`);
      await this.redis.del(registerKey);
      throw new InternalServerErrorException(I18nContext.current()?.t('error.auth.send_code_failed') ?? '发送验证码失败，请稍后重试');
    }

    return {
      message: I18nContext.current()?.t('success.verification_code_sent_email') ?? '验证码已发送到您的邮箱，请查收并完成验证',
      email: email,
    } as unknown as AuthResponseDto;
  }

  async verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto> {
    this.logger.log(`开始验证邮箱: ${email}`);

    const result = await this.emailVerificationService.verifyEmail(email, code);
    if (!result.valid) {
      this.logger.error(`验证码验证失败: ${email}，${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`验证码验证成功: ${email}`);

    const registerKey = `register:pending:${email}`;
    const registerDataStr = await this.redis.get(registerKey);

    if (registerDataStr) {
      const registerData = JSON.parse(registerDataStr);
      this.logger.log(`解析注册信息成功: ${registerData.username}`);

      const user = await this.userService.create({
        email: registerData.email,
        username: registerData.username,
        password: registerData.password,
        nickname: registerData.nickname,
        wechatId: registerData.wechatId,
        provider: registerData.provider || 'LOCAL',
      });

      this.logger.log(`用户创建成功: ${email}`);
      await this.redis.del(registerKey);

      // 不预写微信 URL（页面 COEP=require-corp，前端直连微信头像域名必被拦，落库即永久无效）；
      // 落盘成功由 syncWechatAvatar 写入本地 URL，失败 avatar 保持空
      if (registerData.avatar) {
        await this.userService.syncWechatAvatar(user.id, registerData.avatar);
      }

      const tokens = await this.authTokenService.generateTokens(user);

      if (req && req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role?.name || 'USER';
      }

      return { ...tokens, user: { ...user, role: user.role, status: user.status } };
    }

    const existingUser = await this.userRepo.findByEmail(email);

    if (!existingUser) {
      this.logger.error(`注册信息已过期且用户不存在: ${email}`);
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.registration_info_expired') ?? '注册信息已过期，请重新注册');
    }

    this.logger.log(`已有用户验证邮箱: userId=${existingUser.id}`);

    const updatedUser = await this.userRepo.markEmailVerified(existingUser.id, email);

    const { password: _, ...userWithoutPassword } = updatedUser;
    const tokens = await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = updatedUser.id;
      req.session.userRole = updatedUser.role?.name || 'USER';
    }

    return { ...tokens, user: userWithoutPassword };
  }
}
