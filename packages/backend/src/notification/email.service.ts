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
import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { AppConfig } from '../config/app.config';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

/**
 * 邮件发送客户端（ADR-0082 #495）：
 * SMTP 参数（主机/端口/安全连接/账号/密码/发件人）发送时经运行时配置
 * 三层解析（runtime > env(MAIL_*) > 默认），配置指纹变化即重建命名
 * transporter 'mail'——改配置后下一次发信立即用新配置，无需重启。
 * MailerModule.forRootAsync 启动期建的默认 transport（env 快照）不再用于
 * 发送，仅满足 MailerService 的 transport 必填校验；模板目录/适配器仍由
 * 主 MailerOptions 提供（命名 transporter 共享同一 HandlebarsAdapter）。
 */
@Injectable()
export class EmailService {
  private static readonly TRANSPORTER_NAME = 'mail';

  /** 当前生效 SMTP 参数的指纹；变化即重建命名 transporter */
  private smtpFingerprint: string | null = null;
  /** 当前生效发件人（模板 context 的 supportEmail 也用它） */
  private smtpFrom = '';

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly runtimeConfig: RuntimeConfigService
  ) {}

  /**
   * 三层解析 SMTP 参数；指纹变化时重建命名 transporter 'mail'。
   * 返回当前生效发件人。
   */
  private async ensureSmtpTransporter(): Promise<string> {
    const [host, port, secure, user, pass, from] = await Promise.all([
      this.runtimeConfig.getValue<string>('smtpHost'),
      this.runtimeConfig.getValue<number>('smtpPort'),
      this.runtimeConfig.getValue<boolean>('smtpSecure'),
      this.runtimeConfig.getValue<string>('smtpUser'),
      this.runtimeConfig.getValue<string>('smtpPassword'),
      this.runtimeConfig.getValue<string>('smtpFrom'),
    ]);
    const fingerprint = JSON.stringify([host, port, secure, user, pass, from]);
    if (fingerprint !== this.smtpFingerprint) {
      this.mailerService.removeTransporter(EmailService.TRANSPORTER_NAME);
      this.mailerService.addTransporter(EmailService.TRANSPORTER_NAME, {
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.smtpFingerprint = fingerprint;
      this.smtpFrom = from;
    }
    return this.smtpFrom;
  }

  /** 统一发送出口：热重建 transport + 显式 from + 命名 transporter */
  private async send(
    options: Omit<ISendMailOptions, 'from' | 'transporterName'>
  ): Promise<void> {
    const from = await this.ensureSmtpTransporter();
    await this.mailerService.sendMail({
      ...options,
      from,
      transporterName: EmailService.TRANSPORTER_NAME,
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = this.configService.get('frontendUrl', { infer: true });
    const from = await this.ensureSmtpTransporter();
    await this.send({
      to: email,
      subject: 'CloudCAD - 验证码',
      template: 'email-verification',
      context: {
        token,
        baseUrl,
        expiresIn: '15分钟',
        supportEmail: from,
        productName: 'CloudCAD',
      },
    });
  }

  /**
   * 密码重置请求指向未注册/已注销邮箱时的说明邮件（防账号枚举配套）。
   *
   * forgotPassword 对这类邮箱**不生成验证码**，但仍发一封说明信，让填错邮箱的
   * 真实用户当场得到确切答案——否则前端只能显示「验证码已发送」，用户卡死且
   * 无法自助。账号存在性只出现在收件人自己的邮箱里：HTTP 响应与真实发送完全
   * 一致，外部探测只能消耗 SMTP 额度、无法区分邮件内容。
   *
   * 不含验证码、不含重置链接——不携带任何可自助完成重置的凭据。
   */
  async sendPasswordResetNotRegisteredEmail(
    email: string,
    ctx: { productName: string; supportEmail?: string; supportPhone?: string }
  ): Promise<void> {
    await this.send({
      to: email,
      subject: 'CloudCAD - 未找到该邮箱的账号',
      template: 'password-reset-not-found',
      context: { recipientEmail: email, ...ctx },
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
    await this.send({
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
    await this.send({
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

    await this.send({
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
    await this.send({
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
    await this.send({
      to: to.join(', '),
      subject,
      text,
    });
  }
}
