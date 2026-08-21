///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { SmsCodeScene } from './dto/sms-verification.dto';
import {
  WechatLoginResponseDto,
  WechatBindResponseDto,
  WechatUnbindResponseDto,
} from './dto/wechat.dto';
import {
  SessionRequest,
  UserForToken,
} from './interfaces/jwt-payload.interface';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { Audit } from '../common/decorators/audit.decorator';

import {
  REGISTRATION_SERVICE,
  PASSWORD_SERVICE,
  ACCOUNT_BINDING_SERVICE,
  AUTH_TOKEN_SERVICE,
  IRegistrationService,
  IPasswordService,
  IAccountBindingService,
  IAuthTokenService,
} from './interfaces/service-interfaces';
import {
  AUTHENTICATION_HANDLER,
  OAUTH_HANDLER,
  SMS_AUTH_HANDLER,
  ACCOUNT_BINDING_HANDLER,
  TOKEN_HANDLER,
  IAuthenticationHandler,
  IOAuthHandler,
  ISmsAuthHandler,
  IAccountBindingHandler,
  ITokenHandler,
} from './interfaces/auth-provider.interface';
import { EmailVerificationService } from '../notification/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { MembershipService } from '../vip/membership.service';
import { membershipTierOf } from '../vip/membership-tier';

import type { AuthenticatedUser } from '../common/types/request.types';
import { USER_SERVICE, IUserService, IUserDetail } from '../common/interfaces/user-service.interface';
import { IAuthFacade } from './interfaces/auth-facade.interface';

@Injectable()
export class AuthFacadeService implements IAuthFacade {
  private readonly logger = new Logger(AuthFacadeService.name);

  constructor(
    @Inject(REGISTRATION_SERVICE) private readonly registrationService: IRegistrationService,
    @Inject(PASSWORD_SERVICE) private readonly passwordService: IPasswordService,
    @Inject(ACCOUNT_BINDING_SERVICE) private readonly accountBindingService: IAccountBindingService,
    @Inject(AUTH_TOKEN_SERVICE) private readonly authTokenService: IAuthTokenService,
    @Inject(AUTHENTICATION_HANDLER) private readonly authHandler: IAuthenticationHandler,
    @Inject(OAUTH_HANDLER) private readonly oauthHandler: IOAuthHandler,
    @Inject(SMS_AUTH_HANDLER) private readonly smsAuthHandler: ISmsAuthHandler,
    @Inject(ACCOUNT_BINDING_HANDLER) private readonly accountBindingHandler: IAccountBindingHandler,
    @Inject(TOKEN_HANDLER) private readonly tokenHandler: ITokenHandler,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly smsVerificationService: SmsVerificationService,
    private readonly membershipService: MembershipService,
    @Inject(USER_SERVICE) private readonly userService: IUserService,
  ) {}

  @Audit(AuditAction.USER_REGISTER, ResourceType.USER, {
    details: (_result, args) => {
      const [registerDto] = args as [RegisterDto];
      return { email: registerDto.email, username: registerDto.username };
    },
  })
  async register(
    registerDto: RegisterDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    // 注册固定走 OSS RegistrationService，私有覆盖层（AUTHENTICATION_HANDLER）只接管 login
    return this.registrationService.register(registerDto, req);
  }

  @Audit(AuditAction.USER_VERIFY_EMAIL, ResourceType.USER, {
    when: (result) => Boolean((result as { accessToken?: string } | null)?.accessToken),
    details: (_result, args) => ({ email: args[0] as string }),
  })
  async verifyEmailAndActivate(
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.registrationService.verifyEmailAndActivate(email, code, req);
  }

  @Audit(AuditAction.USER_LOGIN, ResourceType.USER, {
    details: (_result, args) => {
      const [loginDto] = args as [LoginDto];
      return { account: loginDto.account, loginMethod: 'password' };
    },
  })
  async login(
    loginDto: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authHandler.login(loginDto, req);
  }

  @Audit(AuditAction.USER_LOGIN, ResourceType.USER, {
    details: (_result, args) => ({
      phone: args[0] as string,
      loginMethod: 'phone_code',
    }),
  })
  async loginByPhone(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.smsAuthHandler.loginByPhone(phone, code, req);
  }

  @Audit(AuditAction.USER_REGISTER, ResourceType.USER, {
    details: (_result, args) => {
      const [registerDto] = args as [RegisterDto & { phone: string; code: string }];
      return { phone: registerDto.phone, username: registerDto.username };
    },
  })
  async registerByPhone(
    registerDto: RegisterDto & { phone: string; code: string },
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.smsAuthHandler.registerByPhone(registerDto, req);
  }

  async loginWithWechat(
    code: string,
    state: string
  ): Promise<WechatLoginResponseDto> {
    return this.oauthHandler.loginByWechat(code, state);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    return this.tokenHandler.refreshToken(refreshToken);
  }

  @Audit(AuditAction.USER_LOGOUT, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
  })
  async logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void> {
    await this.authTokenService.logout(userId, accessToken, req);
  }

  async revokeToken(token: string): Promise<void> {
    return this.authTokenService.revokeToken(token);
  }

  async generateTokens(user: UserForToken): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    return this.authTokenService.generateTokens(user);
  }

  async validateUser(email: string, password: string): Promise<Omit<UserForToken, 'password'> | null> {
    return this.passwordService.validateUser(email, password);
  }

  async forgotPassword(
    email?: string,
    phone?: string
  ): Promise<{
    message: string;
    mailEnabled: boolean;
    smsEnabled: boolean;
    supportEmail?: string;
    supportPhone?: string;
  }> {
    return this.passwordService.forgotPassword(email, phone);
  }

  async resetPassword(
    email?: string,
    phone?: string,
    code?: string,
    newPassword?: string
  ): Promise<{ message: string }> {
    return this.passwordService.resetPassword(email, phone, code, newPassword);
  }

  async sendBindEmailCode(
    userId: string,
    email: string,
    isRebind: boolean = false
  ): Promise<{ message: string }> {
    return this.accountBindingService.sendBindEmailCode(
      userId,
      email,
      isRebind
    );
  }

  @Audit(AuditAction.USER_BIND_EMAIL, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    details: (_result, args) => ({ email: args[1] as string }),
  })
  async verifyBindEmail(
    userId: string,
    email: string,
    code: string
  ): Promise<{ message: string }> {
    return this.accountBindingService.verifyBindEmail(userId, email, code);
  }

  @Audit(AuditAction.USER_BIND_PHONE, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
    details: (_result, args) => ({ phone: args[1] as string }),
  })
  async bindPhone(
    userId: string,
    phone: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.bindPhone(userId, phone, code);
  }

  async sendUnbindPhoneCode(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.sendUnbindPhoneCode(userId);
  }

  async verifyUnbindPhoneCode(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string; token: string }> {
    return this.accountBindingService.verifyUnbindPhoneCode(userId, code);
  }

  @Audit(AuditAction.USER_REBIND_PHONE, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
    details: (_result, args) => ({ phone: args[1] as string }),
  })
  async rebindPhone(
    userId: string,
    phone: string,
    code: string,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.rebindPhone(userId, phone, code, token);
  }

  async sendUnbindEmailCode(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.sendUnbindEmailCode(userId);
  }

  async verifyUnbindEmailCode(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string; token: string }> {
    return this.accountBindingService.verifyUnbindEmailCode(userId, code);
  }

  @Audit(AuditAction.USER_REBIND_EMAIL, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
    details: (_result, args) => ({ email: args[1] as string }),
  })
  async rebindEmail(
    userId: string,
    email: string,
    code: string,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.rebindEmail(userId, email, code, token);
  }

  @Audit(AuditAction.USER_BIND_WECHAT, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
  })
  async bindWechat(
    userId: string,
    code: string,
    state: string,
    takeover?: boolean
  ): Promise<WechatBindResponseDto> {
    return this.accountBindingService.bindWechat(
      userId,
      code,
      state,
      takeover
    );
  }

  @Audit(AuditAction.USER_UNBIND_WECHAT, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
  })
  async unbindWechat(userId: string): Promise<WechatUnbindResponseDto> {
    return this.accountBindingService.unbindWechat(userId);
  }

  @Audit(AuditAction.USER_UNBIND_EMAIL, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
  })
  async unbindEmail(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.unbindEmail(userId, code);
  }

  @Audit(AuditAction.USER_UNBIND_PHONE, ResourceType.USER, {
    resourceId: (_result, args) => args[0] as string,
    userId: (_result, args) => args[0] as string,
    success: (result) => Boolean((result as { success?: boolean } | null)?.success),
  })
  async unbindPhone(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.unbindPhone(userId, code);
  }

  async checkFieldUniqueness(dto: {
    username?: string;
    email?: string;
    phone?: string;
  }): Promise<{
    usernameExists: boolean;
    emailExists: boolean;
    phoneExists: boolean;
  }> {
    return this.accountBindingService.checkFieldUniqueness(dto);
  }

  async deleteAllRefreshTokens(userId: string): Promise<void> {
    return this.authTokenService.deleteAllRefreshTokens(userId);
  }

  @Audit(AuditAction.USER_LOGIN, ResourceType.USER, {
    details: (_result, args) => ({
      phone: args[0] as string,
      loginMethod: 'phone_verification',
    }),
  })
  async verifyPhoneAndLogin(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.smsAuthHandler.verifyPhoneAndLogin(phone, code, req);
  }

  @Audit(AuditAction.USER_BIND_EMAIL, ResourceType.USER, {
    details: (_result, args) => ({
      email: args[1] as string,
      loginMethod: 'bind_email',
    }),
  })
  async bindEmailAndLogin(
    tempToken: string,
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.accountBindingHandler.bindEmailAndLogin(tempToken, email, code, req);
  }

  @Audit(AuditAction.USER_BIND_PHONE, ResourceType.USER, {
    details: (_result, args) => ({
      phone: args[1] as string,
      loginMethod: 'bind_phone',
    }),
  })
  async bindPhoneAndLogin(
    tempToken: string,
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.accountBindingHandler.bindPhoneAndLogin(tempToken, phone, code, req);
  }

  @Audit(AuditAction.USER_REGISTER, ResourceType.USER, {
    details: (_result, args) => {
      const [email] = args as [string];
      const [, , registerData] = args as [string, string, { phone: string; username: string }];
      return { email, phone: registerData.phone, username: registerData.username };
    },
  })
  async verifyEmailAndRegisterPhone(
    email: string,
    emailCode: string,
    registerData: {
      phone: string;
      code: string;
      username: string;
      password: string;
      nickname?: string;
    },
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.accountBindingHandler.verifyEmailAndRegisterPhone(
      email,
      emailCode,
      registerData,
      req
    );
  }

  async sendVerificationEmail(email: string): Promise<void> {
    return this.emailVerificationService.sendVerificationEmail(email);
  }

  async resendVerificationEmail(email: string): Promise<void> {
    return this.emailVerificationService.resendVerificationEmail(email);
  }

  async sendSmsCode(phone: string, clientIp: string, scene: SmsCodeScene = 'login'): Promise<{ success: boolean; message: string }> {
    // 绑定/换绑场景：发送验证码前先校验手机号是否已被绑定，
    // 避免已绑定的手机号白发送短信
    if (scene === 'bind') {
      const result = await this.accountBindingService.checkFieldUniqueness({ phone });
      if (result.phoneExists) {
        throw new ConflictException(I18nContext.current()?.t('error.account_binding.phone_conflict') ?? '该手机号已被其他用户绑定');
      }
    }
    return this.smsVerificationService.sendVerificationCode(phone, clientIp);
  }

  async verifySmsCode(phone: string, code: string): Promise<{ valid: boolean; message: string }> {
    return this.smsVerificationService.verifyCode(phone, code);
  }

  async getProfileWithMembership(user: AuthenticatedUser) {
    const [freshUser, membership] = await Promise.all([
      this.userService.findById(user.id),
      this.membershipService.getMembership(user.id),
    ]);
    // 防御性剔除 password 字段：无论 USER_SERVICE 实现是否返回密码哈希，
    // 均保证响应（会被前端写入 localStorage）不含任何密码信息
    const safeUser = { ...freshUser } as IUserDetail & { password?: string };
    delete safeUser.password;
    return {
      ...safeUser,
      membershipTierLevel: membership.tierLevel,
      membershipExpiresAt: membership.expiresAt,
      isVip: membership.tierLevel > 0,
      membershipTier: membershipTierOf(membership.tierLevel),
    };
  }
}