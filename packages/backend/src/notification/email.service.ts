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
import { Prisma as PrismaRuntime } from '@cloudcad/db';
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

  /**
   * 运维告警邮件（#311）：纯文本告警单，不依赖模板。
   * kind=raised 触发通知 / kind=resolved 恢复通知。
   */
  async sendAlertEmail(
    to: string[],
    input: {
      kind: 'raised' | 'resolved';
      level: string;
      source: string;
      messageKey: string;
      message: string;
      time: Date;
      detail?: PrismaRuntime.InputJsonValue;
    }
  ): Promise<void> {
    const title = input.kind === 'resolved' ? '告警恢复通知' : 'P0 告警通知';
    const subject = `[CloudCAD][${input.level}] ${title} - ${input.source}/${input.messageKey}`;
    const detailText = input.detail
      ? JSON.stringify(input.detail, null, 2)
      : '-';
    const text = [
      `【${title}】`,
      `级别: ${input.level}`,
      `来源: ${input.source}`,
      `告警键: ${input.messageKey}`,
      `内容: ${input.message}`,
      `时间: ${input.time.toLocaleString('zh-CN')}`,
      `详情: ${detailText}`,
    ].join('\n');

    await this.mailerService.sendMail({
      to: to.join(', '),
      subject,
      text,
    });
  }

  /**
   * P1 聚合告警邮件（#312）：同 source 窗口内多条告警合并一封，含事件数与首次/末次时间。
   */
  async sendAggregatedAlertEmail(
    to: string[],
    input: {
      level: string;
      source: string;
      count: number;
      firstAt: Date;
      lastAt: Date;
      items: { messageKey: string; message: string; time: Date }[];
    }
  ): Promise<void> {
    const subject = `[CloudCAD][${input.level}] P1 聚合告警 - ${input.source}（${input.count} 条）`;
    const lines = [
      `【P1 聚合告警】`,
      `级别: ${input.level}`,
      `来源: ${input.source}`,
      `事件数: ${input.count}`,
      `首次: ${input.firstAt.toLocaleString('zh-CN')}`,
      `末次: ${input.lastAt.toLocaleString('zh-CN')}`,
      '--- 事件明细 ---',
      ...input.items.map(
        (item) =>
          `[${item.time.toLocaleString('zh-CN')}] ${item.messageKey}: ${item.message}`
      ),
    ];
    await this.mailerService.sendMail({
      to: to.join(', '),
      subject,
      text: lines.join('\n'),
    });
  }

  /**
   * P2 每日告警日报（#312）：前一日新增告警清单 + 按 level/source 分组统计。无告警时不发送。
   */
  async sendDailyReportEmail(
    to: string[],
    input: {
      dateLabel: string;
      total: number;
      stats: { level: string; source: string; count: number }[];
      items: {
        level: string;
        source: string;
        messageKey: string;
        message: string;
        createdAt: Date;
        status: string;
      }[];
    }
  ): Promise<void> {
    const subject = `[CloudCAD] 告警日报（${input.dateLabel}）共 ${input.total} 条`;
    const statLines = input.stats.map(
      (s) => `${s.level}/${s.source}: ${s.count}`
    );
    const itemLines = input.items.map(
      (item) =>
        `[${item.level}][${item.status}] ${item.createdAt.toLocaleString('zh-CN')} ${item.source}/${item.messageKey}: ${item.message}`
    );
    const text = [
      `【告警日报】${input.dateLabel}`,
      `新增合计: ${input.total} 条`,
      '--- 分组统计（level/source）---',
      ...(statLines.length > 0 ? statLines : ['无']),
      '--- 告警清单 ---',
      ...(itemLines.length > 0 ? itemLines : ['无']),
    ].join('\n');
    await this.mailerService.sendMail({
      to: to.join(', '),
      subject,
      text,
    });
  }
}
