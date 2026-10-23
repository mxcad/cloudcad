///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must be licensed by Chengdu Dream Kaide Technology Co., Ltd.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { escapeJsonText, renderTemplate } from '@cloudcad/contracts';
import {
  CHANNEL_TEST_REQUEST_TIMEOUT_MS,
  type ChannelTestAction,
  type ChannelTestContext,
  type ChannelTestResult,
} from './runtime-config.types';

/**
 * 告警 Webhook 通道测试动作（ADR-0082 D4，#506）：
 * 按三层解析（runtime > env(ALERT_WEBHOOK_*) > 默认）取 URL 与模板，
 * 向 URL 发一次测试 POST（用当前模板渲染，与生产发送同一 body 形状）。
 *
 * 设计决策：
 * - URL 为空 → 报缺失键清单（静态完整性只要求 URL 非空，模板有默认值）；
 * - HTTP 2xx = 通过；4xx/5xx = 失败并报状态码（机器人 token 失效、
 *   IP 不在白名单等都会体现为 4xx）；超时/网络错误 = 失败并报原因；
 * - 占位符渲染与 WebhookService.render 同语义（JSON 文本转义，防破坏
 *   部署方模板的 JSON 结构）——动作无构造依赖，此处内联同一套替换逻辑；
 * - 一次性请求，不碰 WebhookService 生产实例。
 *
 * 无构造依赖：配置解析全部经 ctx.getValue，动作是上下文的纯函数。
 */
@Injectable()
export class WebhookChannelTestAction implements ChannelTestAction {
  readonly channel = 'webhook';

  async test(ctx: ChannelTestContext): Promise<ChannelTestResult> {
    const [url, template] = await Promise.all([
      ctx.getValue<string>('alertWebhookUrl'),
      ctx.getValue<string>('alertWebhookTemplate'),
    ]);

    if (!url) {
      return {
        ok: false,
        message: 'Webhook 通道未配置（缺失：alertWebhookUrl）',
        problemKeys: ['alertWebhookUrl'],
      };
    }

    const body = this.renderTestPayload(template);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(CHANNEL_TEST_REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        // end-to-end：真实出站 POST 已送达对方端点并拿到 2xx，
        // URL 与鉴权（token/IP 白名单）链路确认可用。
        return {
          ok: true,
          verdict: 'end-to-end',
          message: 'Webhook 测试 POST 成功（HTTP 2xx）',
        };
      }
      // 4xx/5xx 多为 URL 失效、token 过期或 IP 未加白——都指向 URL 配置
      return {
        ok: false,
        message: `Webhook 测试 POST 失败：HTTP ${response.status} ${response.statusText}`,
        problemKeys: ['alertWebhookUrl'],
      };
    } catch (error) {
      return {
        ok: false,
        message: `Webhook 测试 POST 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
        problemKeys: ['alertWebhookUrl'],
      };
    }
  }

  /** 测试 payload：与生产发送同一模板、同一占位符语义（共用 @cloudcad/contracts 的 renderTemplate） */
  private renderTestPayload(template: string): string {
    const now = new Date().toISOString();
    const replacements: Record<string, string> = {
      message: escapeJsonText('CloudCAD 告警通道测试'),
      level: escapeJsonText('P2'),
      source: escapeJsonText('channel-test'),
      timestamp: escapeJsonText(now),
      detail: '',
    };
    return renderTemplate(template, replacements);
  }
}
