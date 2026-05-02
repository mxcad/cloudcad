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
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { WechatService } from './wechat.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import {
  WechatLoginResponseDto,
  WechatBindResponseDto,
  WechatUnbindResponseDto,
} from '../dto/wechat.dto';

@Injectable()
export class AccountBindingService {
  private readonly logger = new Logger(AccountBindingService.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailVerificationService: EmailVerificationService,
    private smsVerificationService: SmsVerificationService,
    private wechatService: WechatService,
    private runtimeConfigService: RuntimeConfigService,
    private authTokenService: AuthTokenService
  ) {}

  async sendBindEmailCode(
    userId: string,
    email: string,
    isRebind: boolean = false
  ): Promise<{ message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) {
      throw new BadRequestException('邮件服务未启用，无法绑定邮箱');
    }

    if (!isRebind) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user?.email) {
        throw new BadRequestException('您已绑定邮箱，如需更换请联系管理员');
      }
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已被其他用户绑定');
    }

    try {
      await this.emailVerificationService.sendVerificationEmail(email);
      this.logger.log(`绑定邮箱验证码已发送: ${email}`);
      return { message: '验证码已发送到您的邮箱' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送绑定邮箱验证码失败: ${err.message}`);
      throw new InternalServerErrorException('发送验证码失败，请稍后重试');
    }
  }

  async verifyBindEmail(
    userId: string,
    email: string,
    code: string,
    isRebind: boolean = false
  ): Promise<{ message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) {
      throw new BadRequestException('邮件服务未启用，无法绑定邮箱');
    }

    if (!isRebind) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (user?.email) {
        throw new BadRequestException('您已绑定邮箱，如需更换请联系管理员');
      }
    }

    const result = await this.emailVerificationService.verifyEmail(email, code);
    if (!result.valid) {
      throw new UnauthorizedException(result.message);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该邮箱已被其他用户绑定');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    this.logger.log(`邮箱绑定成功: userId=${userId}, email=${email}`);

    return { message: '邮箱绑定成功' };
  }

  async bindPhone(
    userId: string,
    phone: string,
    code: string
  ): Promise<{ success: boolean; message: string }> {
    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUser = await this.prisma.user.findFirst({
      where: {
        phone: formattedPhone,
        deletedAt: null,
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该手机号已被其他用户绑定');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    const isReplacing = !!user?.phone;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: formattedPhone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
    });

    this.logger.log(
      `手机号${isReplacing ? '换绑' : '绑定'}成功: userId=${userId}, phone=${formattedPhone}`
    );

    return { success: true, message: '手机号绑定成功' };
  }

  async sendUnbindPhoneCode(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );
    if (!smsEnabled) {
      throw new BadRequestException('短信服务未启用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) {
      throw new BadRequestException('您还未绑定手机号');
    }

    try {
      await this.smsVerificationService.sendVerificationCode(user.phone);
      this.logger.log(
        `换绑验证码已发送：userId=${userId}, phone=${user.phone}`
      );
      return { success: true, message: '验证码已发送到原手机号' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送换绑验证码失败：${err.message}`);
      throw new InternalServerErrorException('发送验证码失败，请稍后重试');
    }
  }

  async verifyUnbindPhoneCode(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string; token: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );
    if (!smsEnabled) {
      throw new BadRequestException('短信服务未启用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) {
      throw new BadRequestException('您还未绑定手机号');
    }

    const verifyResult = await this.smsVerificationService.verifyCode(
      user.phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const token = await this.jwtService.signAsync(
      { userId, phone: user.phone, type: 'unbind-phone' },
      { secret: this.configService.get<string>('jwt.secret'), expiresIn: '5m' }
    );

    this.logger.log(`换绑验证码验证通过：userId=${userId}`);

    return { success: true, message: '验证通过', token };
  }

  async rebindPhone(
    userId: string,
    phone: string,
    code: string,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );
    if (!smsEnabled) {
      throw new BadRequestException('短信服务未启用');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as { userId: string; type: string };

      if (payload.type !== 'unbind-phone' || payload.userId !== userId) {
        throw new BadRequestException('验证 token 无效');
      }
    } catch (error) {
      throw new BadRequestException('验证 token 无效或已过期');
    }

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUser = await this.prisma.user.findFirst({
      where: {
        phone: formattedPhone,
        deletedAt: null,
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该手机号已被其他用户绑定');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: formattedPhone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
    });

    this.logger.log(
      `手机号换绑成功：userId=${userId}, phone=${formattedPhone}`
    );

    return { success: true, message: '手机号换绑成功' };
  }

  // ==================== 邮箱换绑相关 ====================

  /**
   * 发送换绑邮箱验证码到原邮箱
   */
  async sendUnbindEmailCode(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) {
      throw new BadRequestException('邮件服务未启用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      throw new BadRequestException('您还未绑定邮箱');
    }

    try {
      await this.emailVerificationService.sendVerificationEmail(user.email);
      this.logger.log(
        `邮箱换绑验证码已发送：userId=${userId}, email=${user.email}`
      );
      return { success: true, message: '验证码已发送到原邮箱' };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`发送邮箱换绑验证码失败：${err.message}`);
      throw new InternalServerErrorException('发送验证码失败，请稍后重试');
    }
  }

  /**
   * 验证原邮箱验证码，返回换绑 token
   */
  async verifyUnbindEmailCode(
    userId: string,
    code: string
  ): Promise<{ success: boolean; message: string; token: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) {
      throw new BadRequestException('邮件服务未启用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      throw new BadRequestException('您还未绑定邮箱');
    }

    const result = await this.emailVerificationService.verifyEmail(
      user.email,
      code
    );
    if (!result.valid) {
      throw new UnauthorizedException(result.message);
    }

    const token = await this.jwtService.signAsync(
      { userId, email: user.email, type: 'unbind-email' },
      { secret: this.configService.get<string>('jwt.secret'), expiresIn: '5m' }
    );

    this.logger.log(`邮箱换绑验证码验证通过：userId=${userId}`);

    return { success: true, message: '验证通过', token };
  }

  /**
   * 换绑新邮箱
   */
  async rebindEmail(
    userId: string,
    email: string,
    code: string,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) {
      throw new BadRequestException('邮件服务未启用');
    }

    // 验证换绑 token
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as { userId: string; type: string };

      if (payload.type !== 'unbind-email' || payload.userId !== userId) {
        throw new BadRequestException('验证 token 无效');
      }
    } catch (error) {
      throw new BadRequestException('验证 token 无效或已过期');
    }

    // 验证新邮箱的验证码并绑定
    await this.verifyBindEmail(userId, email, code, true);

    this.logger.log(`邮箱换绑成功：userId=${userId}, email=${email}`);

    return { success: true, message: '邮箱换绑成功' };
  }

  async bindWechat(
    userId: string,
    code: string,
    state: string
  ): Promise<WechatBindResponseDto> {
    if (!this.wechatService.validateState(state)) {
      throw new BadRequestException('无效的状态参数');
    }

    const tokenData = await this.wechatService.getAccessToken(code);

    const openid = tokenData.openid;

    const existingUser = await this.prisma.user.findUnique({
      where: { wechatId: openid },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该微信已绑定其他账号');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        wechatId: openid,
        provider: 'WECHAT',
      },
    });

    this.logger.log(`微信绑定成功: 用户ID ${userId}, openid: ${openid}`);

    return {
      success: true,
      message: '微信绑定成功',
    };
  }

  async unbindWechat(userId: string): Promise<WechatUnbindResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        password: true,
        wechatId: true,
      },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (!user.wechatId) {
      throw new BadRequestException('未绑定微信');
    }

    const hasPassword = !!user.password;
    const hasEmail = !!user.email;
    const hasPhone = !!user.phone;

    if (!hasPassword && !hasEmail && !hasPhone) {
      throw new BadRequestException(
        '至少需要保留一种登录方式（设置密码、绑定邮箱或绑定手机）'
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        wechatId: null,
        provider: hasEmail || hasPhone || hasPassword ? 'LOCAL' : 'WECHAT',
      },
    });

    this.logger.log(`微信解绑成功: 用户ID ${userId}`);

    return {
      success: true,
      message: '微信解绑成功',
    };
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
    const result = {
      usernameExists: false,
      emailExists: false,
      phoneExists: false,
    };

    if (dto.username) {
      const user = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      result.usernameExists = !!user;
    }

    if (dto.email) {
      const user = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          deletedAt: null,
        },
      });
      result.emailExists = !!user;
    }

    if (dto.phone) {
      const formattedPhone = dto.phone.replace(/^\+86/, '');
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phone: dto.phone, deletedAt: null },
            { phone: formattedPhone, deletedAt: null },
            { phone: `+86${formattedPhone}`, deletedAt: null },
          ],
        },
      });
      result.phoneExists = !!user;
    }

    return result;
  }
}
