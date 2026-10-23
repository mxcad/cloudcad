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
import { buildXML, parseXML, generateNonceStr, sign } from '../billing/gateway/wechat-pay/wechat-pay.util';
import {
  CHANNEL_TEST_REQUEST_TIMEOUT_MS,
  type ChannelTestAction,
  type ChannelTestContext,
  type ChannelTestResult,
} from './runtime-config.types';

// 与生产网关同源的 API 域名（主 + 备，网络错误时切换）
const API_BASES = [
  'https://api.mch.weixin.qq.com',
  'https://api2.mch.weixin.qq.com',
];

/**
 * 支付通道测试动作（ADR-0082 D4，#505）：
 * 按三层解析（runtime > env(WECHATPAY_*) > 默认）取 paymentProvider 与
 * 微信支付凭据，做无资金签名往返验证（不动钱、不产生订单）。
 *
 * 设计决策：
 * - provider = mock 直接通过（开发模式，与短信通道语义一致）；
 * - provider = wechat_pay：以随机订单号调 /pay/orderquery（只读、零副作用）：
 *   凭据有效时微信返回 return_code=SUCCESS（result_code=FAIL/ORDERNOTEXIST
 *   属业务错误，签名已通过 = 凭据有效）；凭据或密钥无效时返回
 *   return_code=FAIL（「签名失败」/「AppID 和 AppSecret 不匹配」等）→ 判失败；
 * - 签名固定用 MD5：微信按请求声明的 sign_type 验签，商户 API 密钥对两种
 *   算法通用，探测无需读取部署方的 WECHATPAY_SIGN_TYPE（env，D7 不进运行时配置）；
 * - 证书文件（mTLS，仅退款 API 需要）按 D7 留 env，不在本动作验证范围——
 *   网关构造期已做证书加载校验，证书坏了退款会大声失败；
 * - 一次性请求，不碰 WechatPayGateway 生产实例（指纹热重建状态不被测试干扰）；
 *   参数解析与生产同源（ctx.getValue 即 RuntimeConfigService.getValue）。
 *
 * 无构造依赖：配置解析全部经 ctx.getValue，动作是上下文的纯函数。
 */
@Injectable()
export class PaymentChannelTestAction implements ChannelTestAction {
  readonly channel = 'payment';

  async test(ctx: ChannelTestContext): Promise<ChannelTestResult> {
    const provider = await ctx.getValue<string>('paymentProvider');

    switch (provider) {
      case 'mock':
        // simulated：未接触任何外部系统，永不满足通道开启门禁——否则
        // paymentEnabled 可在完全没接支付网关的情况下被开启，订单走
        // MockPaymentGateway「假成功」而不产生任何真实收款。
        return {
          ok: true,
          verdict: 'simulated',
          message: 'Mock 模式（开发测试）：未接真实支付网关，视为通过',
        };
      case 'wechat_pay':
        return this.testWechatPay(ctx);
      default:
        return {
          ok: false,
          message: `未知支付网关：${provider}`,
          problemKeys: ['paymentProvider'],
        };
    }
  }

  private async testWechatPay(
    ctx: ChannelTestContext
  ): Promise<ChannelTestResult> {
    const [appId, mchId, key, notifyUrl] = await Promise.all([
      ctx.getValue<string>('wechatPayAppId'),
      ctx.getValue<string>('wechatPayMchId'),
      ctx.getValue<string>('wechatPayKey'),
      ctx.getValue<string>('wechatPayNotifyUrl'),
    ]);

    const missing = [
      !appId && 'wechatPayAppId',
      !mchId && 'wechatPayMchId',
      !key && 'wechatPayKey',
      !notifyUrl && 'wechatPayNotifyUrl',
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      return {
        ok: false,
        message: `微信支付凭据不完整（缺失：${missing.join('、')}）`,
        problemKeys: missing,
      };
    }

    // 凭据探测：orderquery 只读接口 + 随机订单号，签名错误 = 凭据无效
    const data: Record<string, string> = {
      appid: appId,
      mch_id: mchId,
      out_trade_no: `CCTEST${generateNonceStr()}`,
      nonce_str: generateNonceStr(),
    };
    data.sign = sign(data, key, 'MD5');
    const xml = buildXML('xml', data);

    let lastError = '';
    for (const base of API_BASES) {
      try {
        const response = await fetch(`${base}/pay/orderquery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
          body: xml,
          signal: AbortSignal.timeout(CHANNEL_TEST_REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }
        const parsed = parseXML(await response.text());
        const body = parsed?.xml ?? parsed;

        if (body?.return_code === 'SUCCESS') {
          // 签名通过 = 凭据有效；随机订单号查无订单属预期业务错误。
          // 结论是 probe：orderquery 是只读往返，确认了凭据与链路，
          // 但没有产生任何真实的资金/订单动作。
          return {
            ok: true,
            verdict: 'probe',
            message: '微信支付凭据探测通过（orderquery 签名往返，未产生订单、未动资金）',
          };
        }
        return {
          ok: false,
          message: `微信支付凭据探测失败：${
            body?.return_msg ?? '未知错误'
          }`,
          // 签名未通过 = AppID/商户号/API 密钥三者之一无效
          problemKeys: ['wechatPayAppId', 'wechatPayMchId', 'wechatPayKey'],
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        // 网络错误 → 切备用域名（与生产网关的域名回退一致）
      }
    }

    return {
      ok: false,
      message: `微信支付 API 不可达（主备域名均失败）：${lastError}`,
    };
  }
}
