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

import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from './runtime-config.service';
import { getAuditLoggerInstance } from '../audit/audit-logger.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import {
  CHANNEL_VERDICT_COLUMNS,
  type ChannelStatus,
  type ChannelTestAction,
  type ChannelTestResult,
} from './runtime-config.types';

/**
 * 通道测试动作聚合 token（ADR-0082 D4）。
 * 每个通道的测试动作以 useFactory 聚合注册（NestJS 11 已移除 multi 注入）：
 * `{ provide: CHANNEL_TEST_ACTIONS, useFactory: (a: XxxAction) => [a],
 * inject: [XxxAction] }`——新增通道时把动作类加进 inject 与返回数组。
 * 机制层无动作注册时 token 缺失（@Optional 兜底空数组），
 * 具体动作随各通道落地（邮件见 #495）。
 */
export const CHANNEL_TEST_ACTIONS = 'CHANNEL_TEST_ACTIONS';

/**
 * 通道测试框架（ADR-0082 D4）：
 * - 配置不完整 → 测试失败并带原因（缺失键清单），不执行测试动作、无验证记录；
 * - 测试成功 → 写验证记录（channel/verifiedAt/testedBy）+ 入审计；
 * - 测试失败 → 不写记录（仍入审计：谁、何时、结果）。
 *
 * 验证记录的删除不在本服务：配置写路径（set/reset/profile 应用）在
 * RuntimeConfigService 内直接删表——该服务已持有 prisma，避免与本服务成 DI 环
 * （本服务依赖 RuntimeConfigService 读配置）。
 */
@Injectable()
export class ChannelTestService {
  constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly prisma: DatabaseService,
    @Optional()
    @Inject(CHANNEL_TEST_ACTIONS)
    private readonly actions: ChannelTestAction[] = []
  ) {}

  /** 已注册测试动作的通道名（去重，保持注册顺序） */
  getChannels(): string[] {
    return [...new Set(this.actions.map((action) => action.channel))];
  }

  /** 全部已注册通道的状态（配置完整度 + 验证记录），供管理端呈现 */
  async getChannelsStatus(): Promise<ChannelStatus[]> {
    return Promise.all(
      this.getChannels().map((channel) =>
        this.runtimeConfig.getChannelStatus(channel)
      )
    );
  }

  /**
   * 执行通道验证。成功 → 写验证记录；失败 → 不写记录。
   * 无论成败都入审计（会写入验证门禁证据，且可选端到端发送会外发真实消息，
   * 属敏感操作，ADR-0082 D9）。
   */
  async testChannel(
    channel: string,
    recipient: string | undefined,
    operatorId: string,
    operatorIp?: string
  ): Promise<ChannelTestResult & { channel: string }> {
    const action = this.actions.find((a) => a.channel === channel);
    if (!action) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.config_extra.channel_not_registered', {
          args: { channel },
        }) ?? `通道 ${channel} 未注册测试动作`
      );
    }

    // 配置完整性前置：不完整直接失败（带缺失键原因），不执行测试动作
    const status = await this.runtimeConfig.getChannelStatus(channel);
    if (!status.configComplete) {
      const message = `配置不完整（缺失：${status.missingKeys.join('、')}）`;
      const result: ChannelTestResult = {
        ok: false,
        message,
        problemKeys: status.missingKeys,
      };
      await this.audit(channel, operatorId, result);
      return { channel, ...result };
    }

    let result: ChannelTestResult;
    try {
      result = await action.test({
        getValue: (key) => this.runtimeConfig.getValue(key),
        recipient,
      });
    } catch (error) {
      // 动作自身抛错（如网络异常）归一为失败结果，不让测试端点 500
      result = {
        ok: false,
        message: `测试动作执行异常: ${(error as Error).message}`,
      };
    }

    if (result.ok) {
      // 结论强度随证据一起落库：门禁只认 probe / end-to-end，`simulated`
      // （mock 模式，未接触任何外部系统）记录在册但不满足门禁。动作未声明
      // verdict 按 probe 采信——与存量记录同口径，不静默降格。
      const verdict = result.verdict ?? 'probe';
      await this.prisma.channelVerification.upsert({
        where: { channel },
        update: {
          verifiedAt: new Date(),
          testedBy: operatorId,
          testedByIp: operatorIp,
          verdict: CHANNEL_VERDICT_COLUMNS[verdict],
        },
        create: {
          channel,
          testedBy: operatorId,
          testedByIp: operatorIp,
          verdict: CHANNEL_VERDICT_COLUMNS[verdict],
        },
      });
    }

    await this.audit(channel, operatorId, result);
    return { channel, ...result };
  }

  /**
   * 测试动作入审计（谁、何时、结果）。走 AuditLogModule 注册的全局单例
   * （RuntimeConfigModule 不可 import AuditLogModule——后者反向依赖本模块，
   * 会成环）；单例未注册时跳过，fail-open，与 alert 模块同一约定。
   */
  private async audit(
    channel: string,
    operatorId: string,
    result: ChannelTestResult
  ): Promise<void> {
    const auditLogger = getAuditLoggerInstance();
    if (!auditLogger) {
      return;
    }
    await auditLogger.audit({
      action: AuditAction.CHANNEL_TEST,
      resourceType: ResourceType.SYSTEM,
      resourceName: channel,
      userId: operatorId,
      success: result.ok,
      errorMessage: result.ok ? undefined : result.message,
      params: { channel, result: result.message },
    });
  }
}
