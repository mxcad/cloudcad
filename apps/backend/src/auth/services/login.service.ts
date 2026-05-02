///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { LoginDto, AuthResponseDto } from '../dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { SessionRequest } from '../interfaces/jwt-payload.interface';

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    private prisma: DatabaseService,
    private emailVerificationService: EmailVerificationService,
    private runtimeConfigService: RuntimeConfigService,
    private authTokenService: AuthTokenService,
    private tokenBlacklistService: TokenBlacklistService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async login(
    loginDto: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    const { account, password } = loginDto;

    this.logger.log(`用户登录尝试: ${account}`);

    const isPhone = /^(\+86)?1[3-9]\d{9}$/.test(account);
    const formattedPhone = account.replace(/^\+86/, '');

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: account },
          { username: account },
          ...(isPhone ? [{ phone: formattedPhone }] : []),
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        password: true,
        wechatId: true,
        provider: true,
      },
    });

    if (!user) {
      this.logger.warn(`登录失败 - 用户不存在: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(
        `登录失败 - 账号已禁用: ${account} (状态: ${user.status})`
      );
      throw new UnauthorizedException('账号已被禁用');
    }

    // 先验证密码，防止未认证用户探测验证状态或获取 tempToken
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`登录失败 - 密码错误: ${account}`);
      throw new UnauthorizedException('账号或密码错误');
    }

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    const requireEmailVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requireEmailVerification',
        false
      );

    if (mailEnabled && requireEmailVerification && !user.emailVerified) {
      if (!user.email) {
        // 没有邮箱，需要先绑定邮箱，生成临时 token
        this.logger.warn(`登录失败 - 需要绑定邮箱: ${account}`);
        const tempToken = this.jwtService.sign(
          { sub: user.id, type: 'bind_email_temp' },
          { secret: this.configService.get<string>('JWT_SECRET'), expiresIn: '30m' }
        );
        throw new UnauthorizedException({
          code: 'EMAIL_REQUIRED',
          message: '请先绑定邮箱后再登录',
          tempToken,
        });
      }
      // 有邮箱但未验证
      this.logger.warn(`登录失败 - 邮箱未验证: ${account}`);
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: '请先验证邮箱后再登录',
        email: user.email,
      });
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

    if (smsEnabled && requirePhoneVerification && !user.phoneVerified) {
      if (!user.phone) {
        // 没有手机号，需要先绑定手机号，生成临时 token
        this.logger.warn(`登录失败 - 需要绑定手机号: ${account}`);
        const tempToken = this.jwtService.sign(
          { sub: user.id, type: 'bind_phone_temp' },
          { secret: this.configService.get<string>('JWT_SECRET'), expiresIn: '30m' }
        );
        throw new UnauthorizedException({
          code: 'PHONE_REQUIRED',
          message: '请先绑定手机号后再登录',
          tempToken,
        });
      }
      // 有手机号但未验证
      this.logger.warn(`登录失败 - 手机号未验证: ${account}`);
      throw new UnauthorizedException({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再登录',
        phone: user.phone,
      });
    }

    const hasPassword = !!user.password;
    const { password: _, ...userWithoutPassword } = user;

    const tokens = await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = user.role.name;
      req.session.userEmail = user.email ?? undefined;
      await req.session.save();
      this.logger.log(
        `Session 已设置: userId=${user.id}, role=${user.role.name}`
      );
    }

    this.logger.log(
      `用户登录成功: ${account} (ID: ${user.id}, 角色: ${user.role.name})`
    );

    return {
      ...tokens,
      user: {
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
        hasPassword,
      },
    };
  }
}