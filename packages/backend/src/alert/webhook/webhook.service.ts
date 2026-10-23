import { Injectable, Logger } from '@nestjs/common';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { ClsService } from 'nestjs-cls';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { buildOutboundTraceHeaders } from '../../common/utils/outbound-trace';
import { escapeJsonText, renderTemplate } from '@cloudcad/contracts';
import { AlertLevel } from '../enums/alert.enum';

export interface WebhookAlertInput {
  message: string;
  level: AlertLevel;
  source: string;
  timestamp?: Date;
  detail?: PrismaRuntime.InputJsonValue;
}

/**
 * 通用 Webhook 告警适配器（L1 基础设施层）
 *
 * 职责：
 * 1. 条件启用（ADR-0082 三期 #506）：alertWebhookEnabled 开关 + URL 非空，
 *    每次发送前经 RuntimeConfigService 三层解析（runtime > env(ALERT_WEBHOOK_*) > 默认）
 *    惰性热读——改配置即生效，无需重启；未启用/未配置 URL 时零影响（send 直接返回）
 * 2. 模板渲染：{{message}} / {{level}} / {{source}} / {{timestamp}} / {{detail}} 占位符替换
 *    （默认模板 = 钉钉/企业微信兼容 text 结构，见 alertWebhookTemplate 键定义）
 * 3. 失败不阻断：发送失败仅记日志，不抛出（不影响主流程）
 *
 * 不绑定具体 IM 平台，body 结构由部署方通过模板配置。
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly cls: ClsService,
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {}

  /** 有效启用 = 开关开 且 URL 非空（每次调用热解析，与 send 同一出口） */
  async isEnabled(): Promise<boolean> {
    const [enabled, url] = await Promise.all([
      this.runtimeConfigService.getValue<boolean>('alertWebhookEnabled'),
      this.runtimeConfigService.getValue<string>('alertWebhookUrl'),
    ]);
    return enabled && !!url;
  }

  /**
   * 发送告警到 webhook。未启用或 URL 为空时直接返回；任何发送失败仅记日志，不抛出。
   */
  async send(input: WebhookAlertInput): Promise<void> {
    const [enabled, url, template] = await Promise.all([
      this.runtimeConfigService.getValue<boolean>('alertWebhookEnabled'),
      this.runtimeConfigService.getValue<string>('alertWebhookUrl'),
      this.runtimeConfigService.getValue<string>('alertWebhookTemplate'),
    ]);
    if (!enabled || !url) return;

    const body = this.render(input, template);
    try {
      const response = await fetch(url, {
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
  render(input: WebhookAlertInput, template: string): string {
    const replacements: Record<string, string> = {
      message: escapeJsonText(input.message),
      level: escapeJsonText(input.level),
      source: escapeJsonText(input.source),
      timestamp: escapeJsonText(
        (input.timestamp ?? new Date()).toISOString()
      ),
      detail:
        input.detail === undefined
          ? ''
          : escapeJsonText(JSON.stringify(input.detail)),
    };
    return renderTemplate(template, replacements);
  }
}
