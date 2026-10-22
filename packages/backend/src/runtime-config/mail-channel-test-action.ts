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
import nodemailer from 'nodemailer';
import type {
  ChannelTestAction,
  ChannelTestContext,
  ChannelTestResult,
} from './runtime-config.types';

/**
 * 邮件通道测试动作（ADR-0082 D4，#495）：
 * 按三层解析（runtime > env(MAIL_*) > 默认）取 SMTP 参数，用一次性 transport
 * 向收件人发测试信。收件人缺省 = 客服邮箱（supportEmail）配置值。
 *
 * 用独立一次性 transport 而非生产发送路径的热重建命名 transport：
 * 测试只验证「这套 SMTP 参数能否真的发出去」（DNS/TLS/认证），
 * 不干扰生产 transport 的指纹缓存状态；参数解析与生产路径同源
 * （ChannelTestContext.getValue 即 RuntimeConfigService.getValue），结论对生产成立。
 *
 * 无构造依赖：配置解析全部经 ctx.getValue，动作是上下文的纯函数。
 */
@Injectable()
export class MailChannelTestAction implements ChannelTestAction {
  readonly channel = 'mail';

  async test(ctx: ChannelTestContext): Promise<ChannelTestResult> {
    const [host, port, secure, user, pass, from] = await Promise.all([
      ctx.getValue<string>('smtpHost'),
      ctx.getValue<number>('smtpPort'),
      ctx.getValue<boolean>('smtpSecure'),
      ctx.getValue<string>('smtpUser'),
      ctx.getValue<string>('smtpPassword'),
      ctx.getValue<string>('smtpFrom'),
    ]);

    const to =
      ctx.recipient?.trim() ||
      (await ctx.getValue<string>('supportEmail'))?.trim();
    if (!to) {
      return {
        ok: false,
        message: '未指定测试收件人，且客服邮箱（supportEmail）为空',
      };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'CloudCAD - SMTP 通道测试',
        text: '这是一封来自运行时配置页的测试邮件，用于验证邮件通道配置。收到即表示 SMTP 配置可用。',
      });
      return { ok: true, message: `测试邮件已发送至 ${to}` };
    } finally {
      await transporter.close();
    }
  }
}
