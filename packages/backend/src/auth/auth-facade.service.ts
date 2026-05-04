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
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import {
  WechatLoginResponseDto,
  WechatBindResponseDto,
  WechatUnbindResponseDto,
} from './dto/wechat.dto';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { InitializationService } from '../common/services/initialization.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import {
  USER_SERVICE,
  IUserService,
} from '../common/interfaces/user-service.interface';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import {
  SessionRequest,
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
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
    private emailVerificationService: EmailVerificationService,
    private smsVerificationService: SmsVerificationService,
    private initializationService: InitializationService,
    private runtimeConfigService: RuntimeConfigService,
    @Inject(USER_SERVICE) private readonly userService: IUserService,
    @InjectRedis() private readonly redis: Redis,
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
    const { phone, code, username, password, nickname } = registerDto;

    const allowRegister = await this.runtimeConfigService.getValue<boolean>(
      'allowRegister',
      true
    );
    if (!allowRegister) {
      throw new BadRequestException('系统已关闭注册功能');
    }

    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );
    const requirePhoneVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requirePhoneVerification',
        false
      );
    if (!smsEnabled || !requirePhoneVerification) {
      throw new BadRequestException('手机号注册未启用，请使用邮箱注册');
    }

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUserByPhone = await this.prisma.user.findUnique({
      where: { phone: formattedPhone },
    });
    if (existingUserByPhone) {
      throw new ConflictException('手机号已被注册');
    }

    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      throw new ConflictException('用户名已被使用');
    }

    const user = await this.userService.create({
      username,
      password,
      nickname: nickname || username,
      phone: formattedPhone,
      phoneVerified: true,
    });

    this.logger.log(`手机号注册成功: ${formattedPhone}, username: ${username}`);

    const tokens = await this.authTokenService.generateTokens(user);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: {
        ...user,
        role: user.role,
        status: user.status,
      },
    };
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

  async logout(userId: string, accessToken?: string, req?: any): Promise<void> {
    return this.authTokenService.logout(userId, accessToken, req);
  }

  async revokeToken(token: string): Promise<void> {
    return this.authTokenService.revokeToken(token);
  }

  async generateTokens(user: any): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    return this.authTokenService.generateTokens(user);
  }

  async validateUser(email: string, password: string): Promise<any> {
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
    this.logger.log(`开始验证手机号: ${phone}`);

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const user = await this.prisma.user.findFirst({
      where: { phone: formattedPhone },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('该手机号未注册');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('账号已被禁用');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
    });

    this.logger.log(`手机号验证成功: ${formattedPhone}, userId: ${user.id}`);

    const { password: _, ...userWithoutPassword } = user;
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: {
        ...userWithoutPassword,
        phoneVerified: true,
      },
    };
  }

  async bindEmailAndLogin(
    tempToken: string,
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`开始绑定邮箱并登录: ${email}`);

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('临时令牌无效或已过期，请重新登录');
    }

    if (payload.type !== 'bind_email_temp') {
      throw new BadRequestException('无效的令牌类型');
    }

    const userId = payload.sub;

    const result = await this.emailVerificationService.verifyEmail(email, code);
    if (!result.valid) {
      throw new BadRequestException(result.message);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该邮箱已被其他账号绑定');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    });

    this.logger.log(`邮箱绑定成功: userId=${userId}, email=${email}`);

    const { password: _, ...userWithoutPassword } = user;
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }

  async bindPhoneAndLogin(
    tempToken: string,
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`开始绑定手机号并登录: ${phone}`);

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('临时令牌无效或已过期，请重新登录');
    }

    if (payload.type !== 'bind_phone_temp') {
      throw new BadRequestException('无效的令牌类型');
    }

    const userId = payload.sub;

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUser = await this.prisma.user.findFirst({
      where: { phone: formattedPhone },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该手机号已被其他账号绑定');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: formattedPhone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: { select: { permission: true } },
          },
        },
      },
    });

    this.logger.log(
      `手机号绑定成功: userId=${userId}, phone=${formattedPhone}`
    );

    const { password: _, ...userWithoutPassword } = user;
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: userWithoutPassword,
    };
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
    this.logger.log(
      `开始验证邮箱并完成手机号注册: ${email}, phone: ${registerData.phone}`
    );

    const emailVerifyResult = await this.emailVerificationService.verifyEmail(
      email,
      emailCode
    );
    if (!emailVerifyResult.valid) {
      throw new BadRequestException(emailVerifyResult.message);
    }

    const phoneVerifyResult = await this.smsVerificationService.verifyCode(
      registerData.phone,
      registerData.code
    );
    if (!phoneVerifyResult.valid) {
      throw new BadRequestException(phoneVerifyResult.message);
    }

    const { phone, username, password, nickname } = registerData;
    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUserByPhone = await this.prisma.user.findUnique({
      where: { phone: formattedPhone },
    });
    if (existingUserByPhone) {
      throw new ConflictException('手机号已被注册');
    }

    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      throw new ConflictException('用户名已被使用');
    }

    const existingUserByEmail = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
    if (existingUserByEmail) {
      throw new ConflictException('邮箱已被注册');
    }

    const user = await this.userService.create({
      username,
      password,
      nickname: nickname || username,
      email,
      emailVerified: true,
      phone: formattedPhone,
      phoneVerified: true,
    });

    this.logger.log(
      `手机号注册成功（邮箱验证后）: ${formattedPhone}, email: ${email}, username: ${username}`
    );

    const tokens = await this.authTokenService.generateTokens(user);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: {
        ...user,
        role: user.role,
        status: user.status,
      },
    };
  }
}
