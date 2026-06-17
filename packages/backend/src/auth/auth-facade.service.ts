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
} from '@nestjs/common';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import {
  WechatLoginResponseDto,
  WechatBindResponseDto,
  WechatUnbindResponseDto,
} from './dto/wechat.dto';
import {
  SessionRequest,
  UserForToken,
} from './interfaces/jwt-payload.interface';

import { RegistrationService } from './services/registration.service';
import { PasswordService } from './services/password.service';
import { AccountBindingService } from './services/account-binding.service';
import { AuthTokenService } from './services/auth-token.service';
import { AUTH_PROVIDER, IAuthProvider } from './interfaces/auth-provider.interface';

@Injectable()
export class AuthFacadeService {
  private readonly logger = new Logger(AuthFacadeService.name);

  constructor(
    private registrationService: RegistrationService,
    private passwordService: PasswordService,
    private accountBindingService: AccountBindingService,
    private authTokenService: AuthTokenService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: IAuthProvider
  ) {}

  async register(
    registerDto: RegisterDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.register(registerDto, req);
  }

  async verifyEmailAndActivate(
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.registrationService.verifyEmailAndActivate(email, code, req);
  }

  async login(
    loginDto: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.login(loginDto, req);
  }

  async loginByPhone(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.loginByPhone(phone, code, req);
  }

  async registerByPhone(
    registerDto: RegisterDto & { phone: string; code: string },
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.registerByPhone(registerDto, req);
  }

  async loginWithWechat(
    code: string,
    state: string
  ): Promise<WechatLoginResponseDto> {
    return this.authProvider.loginByWechat(code, state);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    return this.authProvider.refreshToken(refreshToken);
  }

  async logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void> {
    return this.authTokenService.logout(userId, accessToken, req);
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

  async verifyBindEmail(
    userId: string,
    email: string,
    code: string
  ): Promise<{ message: string }> {
    return this.accountBindingService.verifyBindEmail(userId, email, code);
  }

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

  async rebindEmail(
    userId: string,
    email: string,
    code: string,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.rebindEmail(userId, email, code, token);
  }

  async bindWechat(
    userId: string,
    code: string,
    state: string
  ): Promise<WechatBindResponseDto> {
    return this.accountBindingService.bindWechat(userId, code, state);
  }

  async unbindWechat(userId: string): Promise<WechatUnbindResponseDto> {
    return this.accountBindingService.unbindWechat(userId);
  }

  async unbindEmail(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.unbindEmail(userId);
  }

  async unbindPhone(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.accountBindingService.unbindPhone(userId);
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

  async verifyPhoneAndLogin(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.verifyPhoneAndLogin(phone, code, req);
  }

  async bindEmailAndLogin(
    tempToken: string,
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.bindEmailAndLogin(tempToken, email, code, req);
  }

  async bindPhoneAndLogin(
    tempToken: string,
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authProvider.bindPhoneAndLogin(tempToken, phone, code, req);
  }

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
    return this.authProvider.verifyEmailAndRegisterPhone(
      email,
      emailCode,
      registerData,
      req
    );
  }
}
