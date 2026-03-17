///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { AppConfig } from '../../config/app.config';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AppConfig>
  ) {}

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.configService.get('frontendUrl', { infer: true });
    const mailConfig = this.configService.get('mail', { infer: true })!;
    await this.mailerService.sendMail({
      to: email,
      subject: 'CloudCAD - 验证码',
      template: 'email-verification',
      context: {
        token, // 6位数字验证码
        baseUrl, // 前端验证页面地址
        expiresIn: '15分钟',
        supportEmail: mailConfig.from,
        productName: 'CloudCAD',
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.configService.get('frontendUrl', { infer: true });
    const mailConfig = this.configService.get('mail', { infer: true })!;
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'CloudCAD - 密码重置',
      template: 'password-reset',
      context: {
        resetLink,
        expiresIn: '30分钟',
        supportEmail: mailConfig.from,
        productName: 'CloudCAD',
      },
    });
  }
}