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
import Dysmsapi20170525, * as dysmsapi from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import type {
  ChannelTestAction,
  ChannelTestContext,
  ChannelTestResult,
} from './runtime-config.types';

// 腾讯云短信客户端（与生产 provider 同一 SDK 与 endpoint）
const TencentSmsClient = tencentcloud.sms.v20210111.Client;

/**
 * 短信通道测试动作（ADR-0082 D4，#502）：
 * 按三层解析（runtime > env > 默认）取 smsProvider 与对应凭据键，
 * 用服务商查询 API 做凭据探测（不发短信、不花钱），
 * 管理员显式填写收件人时追加一次真实发送（花一条短信钱）。
 *
 * 设计决策：
 * - 完整性按 provider 条件判定：静态完整性只要求 smsProvider 非空，
 *   所选服务商的凭据键在这里校验、失败信息报缺失键清单
 *   （测试通过才是真闸门，与邮件通道语义一致）；
 * - 探测 API = 阿里云 QuerySmsSignList / 腾讯云 DescribeSmsSignList
 *   （无必填业务参数，签名错误即凭据无效）；
 * - 客户端一次性构造，不碰 SmsVerificationService 的生产 provider 实例
 *   （指纹热重建状态不被测试干扰）；参数解析与生产同源（ctx.getValue
 *   即 RuntimeConfigService.getValue），结论对生产成立；
 * - 真实发送用固定测试码 '000000'，模板参数名按验证码模板惯例取 code
 *   （腾讯云 TemplateParamSet 是位置数组，无参数名问题）。
 *
 * 无构造依赖：配置解析全部经 ctx.getValue，动作是上下文的纯函数。
 */
@Injectable()
export class SmsChannelTestAction implements ChannelTestAction {
  readonly channel = 'sms';

  async test(ctx: ChannelTestContext): Promise<ChannelTestResult> {
    const provider = await ctx.getValue<string>('smsProvider');

    switch (provider) {
      case 'mock':
        return {
          ok: true,
          message: 'Mock 模式（开发测试）：未接真实短信服务，视为通过',
        };
      case 'aliyun':
        return this.testAliyun(ctx);
      case 'tencent':
        return this.testTencent(ctx);
      default:
        return { ok: false, message: `未知短信服务商：${provider}` };
    }
  }

  private async testAliyun(
    ctx: ChannelTestContext
  ): Promise<ChannelTestResult> {
    const [accessKeyId, accessKeySecret, signName, templateCode] =
      await Promise.all([
        ctx.getValue<string>('aliyunSmsAccessKeyId'),
        ctx.getValue<string>('aliyunSmsAccessKeySecret'),
        ctx.getValue<string>('aliyunSmsSignName'),
        ctx.getValue<string>('aliyunSmsTemplateCode'),
      ]);

    const missing = [
      !accessKeyId && 'aliyunSmsAccessKeyId',
      !accessKeySecret && 'aliyunSmsAccessKeySecret',
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      return {
        ok: false,
        message: `阿里云凭据不完整（缺失：${missing.join('、')}）`,
      };
    }

    const client = new Dysmsapi20170525(
      new OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        endpoint: 'dysmsapi.aliyuncs.com',
      })
    );

    // 凭据探测：QuerySmsSignList 无必填业务参数，签名错误 = AK/SK 无效
    try {
      await client.querySmsSignList(new dysmsapi.QuerySmsSignListRequest({}));
    } catch (error) {
      return {
        ok: false,
        message: `阿里云凭据探测失败：${this.describeError(error)}`,
      };
    }

    const to = ctx.recipient?.trim();
    if (!to) {
      return {
        ok: true,
        message: '阿里云短信凭据探测通过（QuerySmsSignList，未发送短信）',
      };
    }

    const missingSend = [
      !signName && 'aliyunSmsSignName',
      !templateCode && 'aliyunSmsTemplateCode',
    ].filter(Boolean) as string[];
    if (missingSend.length > 0) {
      return {
        ok: false,
        message: `真实发送需配置签名与模板（缺失：${missingSend.join('、')}）`,
      };
    }

    // 阿里云不需要 +86 前缀（与生产 provider 的 formatPhone 一致：剥 +86）
    const phone = to.replace(/^\+86/, '');
    try {
      const result = await client.sendSms(
        new dysmsapi.SendSmsRequest({
          phoneNumbers: phone,
          signName,
          templateCode,
          templateParam: JSON.stringify({ code: '000000' }),
        })
      );
      if (result.body?.code !== 'OK') {
        return {
          ok: false,
          message: `测试短信发送失败：${result.body?.message ?? '未知错误'}`,
        };
      }
      return { ok: true, message: `凭据探测通过，测试短信已发送至 ${to}` };
    } catch (error) {
      return {
        ok: false,
        message: `测试短信发送失败：${this.describeError(error)}`,
      };
    }
  }

  private async testTencent(
    ctx: ChannelTestContext
  ): Promise<ChannelTestResult> {
    const [secretId, secretKey, appId, signName, templateCode, region] =
      await Promise.all([
        ctx.getValue<string>('tencentSmsSecretId'),
        ctx.getValue<string>('tencentSmsSecretKey'),
        ctx.getValue<string>('tencentSmsAppId'),
        ctx.getValue<string>('tencentSmsSignName'),
        ctx.getValue<string>('tencentSmsTemplateCode'),
        ctx.getValue<string>('tencentSmsRegion'),
      ]);

    const missing = [
      !secretId && 'tencentSmsSecretId',
      !secretKey && 'tencentSmsSecretKey',
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      return {
        ok: false,
        message: `腾讯云凭据不完整（缺失：${missing.join('、')}）`,
      };
    }

    const client = new TencentSmsClient({
      credential: { secretId, secretKey },
      region: region || 'ap-guangzhou',
      profile: {
        signMethod: 'HmacSHA256',
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 30,
          endpoint: 'sms.tencentcloudapi.com',
        },
      },
    });

    // 凭据探测：DescribeSmsSignList 仅需 International，签名错误 = SecretId/Key 无效
    try {
      await client.DescribeSmsSignList({ International: 0 });
    } catch (error) {
      return {
        ok: false,
        message: `腾讯云凭据探测失败：${this.describeError(error)}`,
      };
    }

    const to = ctx.recipient?.trim();
    if (!to) {
      return {
        ok: true,
        message: '腾讯云短信凭据探测通过（DescribeSmsSignList，未发送短信）',
      };
    }

    const missingSend = [
      !appId && 'tencentSmsAppId',
      !signName && 'tencentSmsSignName',
      !templateCode && 'tencentSmsTemplateCode',
    ].filter(Boolean) as string[];
    if (missingSend.length > 0) {
      return {
        ok: false,
        message: `真实发送需配置 AppID、签名与模板（缺失：${missingSend.join('、')}）`,
      };
    }

    // 腾讯云需要国际区号（与生产 provider 的 formatPhone 一致）
    const phone = to.startsWith('+') ? to : `+86${to}`;
    try {
      const result = await client.SendSms({
        SmsSdkAppId: appId,
        SignName: signName,
        TemplateId: templateCode,
        PhoneNumberSet: [phone],
        TemplateParamSet: ['000000'],
      });
      const status = result.SendStatusSet?.[0];
      if (status?.Code !== 'Ok') {
        return {
          ok: false,
          message: `测试短信发送失败：${status?.Message ?? '未知错误'}`,
        };
      }
      return { ok: true, message: `凭据探测通过，测试短信已发送至 ${to}` };
    } catch (error) {
      return {
        ok: false,
        message: `测试短信发送失败：${this.describeError(error)}`,
      };
    }
  }

  private describeError(error: unknown): string {
    // 阿里云 SDK 错误形如 "InvalidAccessKeyId.NotFound : ..."，腾讯云形如
    // "Error: Action ... invalid"——保留原文，管理员可据此定位凭据问题
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
