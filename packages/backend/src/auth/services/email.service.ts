///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
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