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
import { AppConfig } from '../config/app.config';

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
        token,
        baseUrl,
        expiresIn: '15分钟',
        supportEmail: mailConfig.from,
        productName: 'CloudCAD',
      },
    });
  }

  /**
   * 退款申请提交后通知管理员邮箱列表（to 为逗号分隔解析出的多个收件人）
   */
  async sendRefundApplicationNotify(
    to: string[],
    ctx: {
      userName: string;
      orderNo: string;
      description: string;
      amountYuan: number;
      reason: string;
      appliedAt: Date;
    }
  ): Promise<void> {
    const baseUrl = this.configService.get('frontendUrl', { infer: true });
    await this.mailerService.sendMail({
      to: to.join(', '),
      subject: 'CloudCAD - 新退款申请待审核',
      template: 'refund-application',
      context: {
        ...ctx,
        appliedAt: ctx.appliedAt.toLocaleString('zh-CN'),
        adminUrl: `${baseUrl}/admin/billing`,
        productName: 'CloudCAD',
      },
    });
  }

  /**
   * 退款申请审核通过/驳回后通知用户本人
   */
  async sendRefundResultNotify(
    to: string,
    ctx: {
      orderNo: string;
      amountYuan: number;
      status: 'approved' | 'rejected';
      reason: string;
      note: string;
    }
  ): Promise<void> {
    const approved = ctx.status === 'approved';
    await this.mailerService.sendMail({
      to,
      subject: `CloudCAD - 退款申请${approved ? '已通过' : '已驳回'}`,
      template: 'refund-result',
      context: {
        ...ctx,
        approved,
        resultLabel: approved ? '已通过' : '已驳回',
        productName: 'CloudCAD',
      },
    });
  }
}
