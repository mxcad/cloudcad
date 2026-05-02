///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, BadRequestException, ConflictException, InternalServerErrorException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { RegisterDto, AuthResponseDto } from '../dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { USER_SERVICE, IUserService } from '../../common/interfaces/user-service.interface';
import { AuthTokenService } from './auth-token.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SessionRequest } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailVerificationService: EmailVerificationService,
    private runtimeConfigService: RuntimeConfigService,
    @Inject(USER_SERVICE) private readonly userService: IUserService,
    private authTokenService: AuthTokenService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  async register(
    registerDto: RegisterDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    const { email, username, password, nickname, wechatTempToken } = registerDto;

    const allowRegister = await this.runtimeConfigService.getValue<boolean>(
      'allowRegister',
      true
    );
    if (!allowRegister) {
      throw new BadRequestException('系统已关闭注册功能');
    }

    if (email) {
      const existingUserByEmail = await this.prisma.user.findFirst({
        where: { 
          email,
          deletedAt: null,
        },
      });
      if (existingUserByEmail) {
        throw new ConflictException('邮箱已被注册');
      }
    }

    const existingUserByUsername = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      throw new ConflictException('用户名已被使用');
    }

    let wechatData: { wechatId: string; nickname: string; avatar: string } | null = null;
    if (wechatTempToken) {
      try {
        const payload = this.jwtService.verify(wechatTempToken, {
          secret: this.configService.get<string>('JWT_SECRET'),
        }) as any;

        if (payload.type === 'wechat_temp' && payload.wechatId) {
          wechatData = {
            wechatId: payload.wechatId,
            nickname: payload.nickname || username,
            avatar: payload.avatar || '',
          };

          const existingWechatUser = await this.prisma.user.findUnique({
            where: { wechatId: wechatData.wechatId },
          });
          if (existingWechatUser) {
            throw new ConflictException('该微信已绑定其他账号');
          }
        }
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        throw new BadRequestException('无效的微信临时 Token');
      }
    }

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );

    if (!mailEnabled) {
      const user = await this.userService.create({
        email: email || undefined,
        username,
        password,
        nickname: nickname || wechatData?.nickname || username,
        avatar: wechatData?.avatar,
        wechatId: wechatData?.wechatId,
        provider: wechatData ? 'WECHAT' : 'LOCAL',
      });

      this.logger.log(`用户直接注册成功（邮件服务未启用）: ${username}`);

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

    const requireEmailVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requireEmailVerification',
        false
      );

    if (requireEmailVerification && !email) {
      throw new BadRequestException('邮箱验证已启用，注册需要提供邮箱地址');
    }

    if (!requireEmailVerification) {
      const user = await this.userService.create({
        email: email || undefined,
        username,
        password,
        nickname: nickname || wechatData?.nickname || username,
        avatar: wechatData?.avatar,
        wechatId: wechatData?.wechatId,
        provider: wechatData ? 'WECHAT' : 'LOCAL',
      });

      this.logger.log(`用户直接注册成功（无需邮箱验证）: ${username}`);

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

    const registerKey = `register:pending:${email}`;
    await this.redis.setex(
      registerKey,
      15 * 60,
      JSON.stringify({
        email,
        username,
        password,
        nickname: nickname || wechatData?.nickname || username,
        avatar: wechatData?.avatar,
        wechatId: wechatData?.wechatId,
        provider: wechatData ? 'WECHAT' : 'LOCAL',
      })
    );

    try {
      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`验证码已发送: ${email}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送验证码失败: ${err.message}`);
      await this.redis.del(registerKey);
      throw new InternalServerErrorException('发送验证码失败，请稍后重试');
    }

    return {
      message: '验证码已发送到您的邮箱，请查收并完成验证',
      email: email,
    } as unknown as AuthResponseDto;
  }

  async verifyEmailAndActivate(
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
this.logger.log(`开始验证邮箱: ${email}`);

    const result = await this.emailVerificationService.verifyEmail(email, code);

    if (!result.valid) {
      this.logger.error(`验证码验证失败: ${email}，${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`验证码验证成功: ${email}`);

    // 场景1：注册流程 - Redis 中有 pending 注册信息，需要创建用户
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
        avatar: registerData.avatar,
        wechatId: registerData.wechatId,
        provider: registerData.provider || 'LOCAL',
      });

      this.logger.log(`用户创建成功: ${email}`);

      await this.redis.del(registerKey);

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

    // 场景2：已有用户验证邮箱 - 用户已注册但邮箱未验证
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } } },
    });

    if (!existingUser) {
      this.logger.error(`注册信息已过期且用户不存在: ${email}`);
      throw new BadRequestException('注册信息已过期，请重新注册');
    }

    this.logger.log(`已有用户验证邮箱: userId=${existingUser.id}`);

    const updatedUser = await this.prisma.user.update({
      where: { id: existingUser.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      include: { role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } } },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    const tokens = await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      req.session.userId = updatedUser.id;
      req.session.userRole = updatedUser.role?.name || 'USER';
    }

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }
}