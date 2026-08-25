import { Injectable, Logger } from '@nestjs/common';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { ClsService } from 'nestjs-cls';
import { buildOutboundTraceHeaders } from '../../common/utils/outbound-trace';
import { AlertLevel } from '../enums/alert.enum';

export interface WebhookAlertInput {
  message: string;
  level: AlertLevel;
  source: string;
  timestamp?: Date;
  detail?: PrismaRuntime.InputJsonValue;
}

/**
 * 默认 body 模板：钉钉 / 企业微信兼容的 text 消息结构（见 docs/research/webhook-message-formats.md 5.3）。
 * 部署方可用 ALERT_WEBHOOK_TEMPLATE 覆盖为任意平台结构（飞书 msg_type / Slack 顶层 text 等）。
 */
const DEFAULT_TEMPLATE =
  '{"msgtype":"text","text":{"content":"[{{level}}] {{source}} {{timestamp}}\\n{{message}}\\n{{detail}}"}}';

/**
 * 通用 Webhook 告警适配器（L1 基础设施层）
 *
 * 职责：
 * 1. 条件启用：仅配置 ALERT_WEBHOOK_URL 时启用（SENTRY_DSN 模式），未配置零影响（send 直接返回）
 * 2. 模板渲染：{{message}} / {{level}} / {{source}} / {{timestamp}} / {{detail}} 占位符替换
 * 3. 失败不阻断：发送失败仅记日志，不抛出（不影响主流程）
 *
 * 不绑定具体 IM 平台，body 结构由部署方通过模板配置。
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly url: string | undefined;
  private readonly template: string;

  constructor(private readonly cls: ClsService) {
    this.url = process.env.ALERT_WEBHOOK_URL;
    this.template = process.env.ALERT_WEBHOOK_TEMPLATE ?? DEFAULT_TEMPLATE;
  }

  get isEnabled(): boolean {
    return !!this.url;
  }

  /**
   * 发送告警到 webhook。未配置 URL 时直接返回；任何发送失败仅记日志，不抛出。
   */
  async send(input: WebhookAlertInput): Promise<void> {
    if (!this.url) return;

    const body = this.render(input);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // X-Request-Id/X-Trace-Id 透传（#309）：定时任务无 CLS 时自动生成新 id
          ...buildOutboundTraceHeaders(
            {
              requestId: this.cls?.get<string>('requestId'),
              traceId: this.cls?.get<string>('traceId'),
            },
            'alert-webhook',
          ),
        },
        body,
      });
      if (!response.ok) {
        this.logger.error(
          `Webhook 告警发送失败: HTTP ${response.status} ${response.statusText} (${input.source}/${input.message})`
        );
        return;
      }
      this.logger.log(
        `Webhook 告警已发送: ${input.source}/${input.message}`
      );
    } catch (error: unknown) {
      this.logger.error(
        `Webhook 告警发送异常: ${
          error instanceof Error ? error.message : String(error)
        } (${input.source}/${input.message})`
      );
    }
  }

  /**
   * 渲染模板：替换全部占位符。未识别的占位符原样保留。
   * 全部占位符做 JSON 文本转义（防止破坏部署方模板的 JSON 结构）；
   * detail 为对象时整体 JSON.stringify 后再转义，undefined 时替换为空串。
   */
  render(input: WebhookAlertInput): string {
    const replacements: Record<string, string> = {
      message: this.escapeJsonText(input.message),
      level: this.escapeJsonText(input.level),
      source: this.escapeJsonText(input.source),
      timestamp: this.escapeJsonText(
        (input.timestamp ?? new Date()).toISOString()
      ),
      detail:
        input.detail === undefined
          ? ''
          : this.escapeJsonText(JSON.stringify(input.detail)),
    };
    return this.template.replace(
      /\{\{(\w+)\}\}/g,
      (match, key: string) => replacements[key] ?? match
    );
  }

  private escapeJsonText(value: string): string {
    return JSON.stringify(value).slice(1, -1);
  }
}
