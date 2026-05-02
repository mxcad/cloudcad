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
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private prisma: DatabaseService,
    private emailVerificationService: EmailVerificationService,
    private smsVerificationService: SmsVerificationService,
    private runtimeConfigService: RuntimeConfigService,
    private authTokenService: AuthTokenService,
    private tokenBlacklistService: TokenBlacklistService
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          include: {
            permissions: true,
          },
        },
        status: true,
        password: true,
      },
    });

    if (user && user.status === 'ACTIVE') {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (isPasswordValid) {
        const { password: _, ...result } = user;
        return result;
      }
    }
    return null;
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
    if (!email && !phone) {
      throw new BadRequestException('邮箱和手机号不能同时为空');
    }

    this.logger.log(`忘记密码请求：email=${email}, phone=${phone}`);

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );

    if (!mailEnabled && !smsEnabled) {
      const supportEmail = await this.runtimeConfigService.getValue<string>(
        'supportEmail',
        ''
      );
      const supportPhone = await this.runtimeConfigService.getValue<string>(
        'supportPhone',
        ''
      );

      return {
        message: '邮件服务和短信服务均未启用，请联系客服重置密码',
        mailEnabled: false,
        smsEnabled: false,
        supportEmail,
        supportPhone,
      };
    }

    if (email) {
      if (!mailEnabled) {
        const supportEmail = await this.runtimeConfigService.getValue<string>(
          'supportEmail',
          ''
        );
        const supportPhone = await this.runtimeConfigService.getValue<string>(
          'supportPhone',
          ''
        );

        return {
          message: '邮件服务未启用，无法使用邮箱重置密码，请联系客服',
          mailEnabled: false,
          smsEnabled,
          supportEmail,
          supportPhone,
        };
      }

      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new UnauthorizedException('该邮箱未注册');
      }

      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('账号已被禁用，无法重置密码');
      }

      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`密码重置验证码已发送：${email}`);

      return {
        message: '密码重置验证码已发送到您的邮箱',
        mailEnabled: true,
        smsEnabled,
      };
    }

    if (phone) {
      if (!smsEnabled) {
        const supportEmail = await this.runtimeConfigService.getValue<string>(
          'supportEmail',
          ''
        );
        const supportPhone = await this.runtimeConfigService.getValue<string>(
          'supportPhone',
          ''
        );

        return {
          message: '短信服务未启用，无法使用手机号重置密码，请联系客服',
          mailEnabled,
          smsEnabled: false,
          supportEmail,
          supportPhone,
        };
      }

      const user = await this.prisma.user.findUnique({
        where: { phone },
      });

      if (!user) {
        throw new UnauthorizedException('该手机号未注册');
      }

      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('账号已被禁用，无法重置密码');
      }

      await this.smsVerificationService.sendVerificationCode(phone);
      this.logger.log(`密码重置验证码已发送：${phone}`);

      return {
        message: '密码重置验证码已发送到您的手机',
        mailEnabled,
        smsEnabled: true,
      };
    }

    throw new BadRequestException('邮箱和手机号不能同时为空');
  }

  async resetPassword(
    email?: string,
    phone?: string,
    code?: string,
    newPassword?: string
  ): Promise<{ message: string }> {
    this.logger.log(`重置密码请求：email=${email}, phone=${phone}`);

    let user;
    if (email) {
      const result = await this.emailVerificationService.verifyEmail(
        email,
        code
      );
      if (!result.valid) {
        this.logger.error(`验证码验证失败：${email}，${result.message}`);
        throw new UnauthorizedException(result.message);
      }
      user = await this.prisma.user.findUnique({
        where: { email },
      });
    } else if (phone) {
      const result = await this.smsVerificationService.verifyCode(phone, code);
      if (!result.valid) {
        this.logger.error(`验证码验证失败：${phone}，${result.message}`);
        throw new UnauthorizedException(result.message);
      }
      user = await this.prisma.user.findUnique({
        where: { phone },
      });
    }

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await this.authTokenService.deleteAllRefreshTokens(user.id);
    await this.tokenBlacklistService.removeUserFromBlacklist(user.id);

    this.logger.log(`密码重置成功：email=${email ?? phone}`);

    return {
      message: '密码重置成功，请使用新密码登录',
    };
  }
}
