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
import {
  CHANNEL_TEST_REQUEST_TIMEOUT_MS,
  type ChannelTestAction,
  type ChannelTestContext,
  type ChannelTestResult,
} from './runtime-config.types';

/**
 * 邮件通道验证动作（ADR-0082 D4，#495）：
 * 按三层解析（runtime > env(MAIL_*) > 默认）取 SMTP 参数，用一次性 transport 验证。
 * 两段式（与短信通道同构，D4 修订）：
 * - 未指定收件人 → `transporter.verify()`，只做 EHLO + AUTH，不发送邮件；
 * - 指定收件人 → 真发一封测试信，做端到端确认（发信配额、MAIL FROM 是否被接受、
 *   收件人是否有效——这些都是 verify() 探测不到的）。
 *
 * 收件人缺省回落客服邮箱（supportEmail）的旧逻辑已移除：留空即「只验证不发信」，
 * 不再静默向第三方邮箱投递一封管理员没有点名的邮件。
 *
 * 用独立一次性 transport 而非生产发送路径的热重建命名 transport：
 * 验证不干扰生产 transport 的指纹缓存状态；参数解析与生产路径同源
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

    const to = ctx.recipient?.trim();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // 管理端点上的验证请求必须有界：主机名解析慢或黑洞端口时不能被静默挂起
      // （本动作此前无超时，是本模块 5 个动作里唯一的无界 fetch/verify）
      socketTimeout: CHANNEL_TEST_REQUEST_TIMEOUT_MS,
    });
    try {
      if (!to) {
        // 无副作用验证：只校验连接与认证，不占发信配额、不投递任何邮件。
        // 结论是 probe 而非 end-to-end——verify() 测不到 MAIL FROM 是否被拒、
        // SPF/DKIM、发信配额、收件人有效性，这些只在真实发送时才暴露。
        await transporter.verify();
        return {
          ok: true,
          verdict: 'probe',
          message: 'SMTP 连接与认证验证通过（未发送邮件）',
        };
      }

      await transporter.sendMail({
        from,
        to,
        subject: 'CloudCAD - SMTP 通道验证',
        text: '这是一封来自运行时配置页的验证邮件。收到即表示 SMTP 配置可用，且该发信链路端到端畅通。',
      });
      return {
        ok: true,
        verdict: 'end-to-end',
        message: `验证通过，测试邮件已发送至 ${to}`,
      };
    } catch (error) {
      // 捕获后按错误类型归因配置键（认证失败 → 账号/口令，DNS/连接失败 → 主机/端口），
      // verify 与 sendMail 共用同一套归因（EAUTH / ENOTFOUND 等对两者同义）；
      // 动作未覆盖的异常仍由 ChannelTestService 归一兜底
      return {
        ok: false,
        message: to
          ? `测试邮件发送失败：${
              error instanceof Error ? error.message : String(error)
            }`
          : `SMTP 验证失败：${
              error instanceof Error ? error.message : String(error)
            }`,
        problemKeys: this.diagnoseMailError(error),
      };
    } finally {
      await transporter.close();
    }
  }

  /** SMTP 发送失败 → 疑似出错的配置键（认证失败 / DNS 或连接失败 / 无法归因） */
  private diagnoseMailError(error: unknown): string[] {
    const code = (error as { code?: string })?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'EAUTH' || /invalid login|authentication failed/i.test(message)) {
      return ['smtpUser', 'smtpPassword'];
    }
    if (
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message)
    ) {
      return ['smtpHost', 'smtpPort'];
    }
    return [];
  }
}
