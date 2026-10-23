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
import {
  CHANNEL_TEST_REQUEST_TIMEOUT_MS,
  type ChannelTestAction,
  type ChannelTestContext,
  type ChannelTestResult,
} from './runtime-config.types';

/**
 * 微信通道测试动作（ADR-0082 D4，#503）：
 * 按三层解析（runtime > env(WECHAT_APP_ID/WECHAT_APP_SECRET) > 默认）取
 * AppID/AppSecret，调微信 gettoken API 探测凭据（不产生任何副作用）。
 *
 * errcode 语义（微信开放平台）：
 * - 无 errcode = 凭据有效，通过；
 * - 40163 / 48001 = 凭据有效但接口未授权（IP 未加白名单 / API 未开通），
 *   凭据本身没问题 → 通过并注明；
 * - 40013（invalid appid）/ 40125（invalid appsecret）/ 40001（invalid
 *   parameter）= 凭据无效 → 失败，附中文原因提示（WECHAT_ERRCODE_DIAGNOSIS，
 *   微信原始 errmsg 是英文 + rid 后缀，管理员无法直接读懂）+ 出错配置键
 *   （problemKeys，前端据此定位到对应配置项）；
 * - 其余 errcode → 失败并带 errmsg（管理员可据此定位），无法归因到具体键。
 *
 * 无构造依赖：配置解析全部经 ctx.getValue，动作是上下文的纯函数。
 */

/** 已知凭据 errcode → 用户可读原因提示 + 出错配置键（gettoken 接口的凭据类错误） */
const WECHAT_ERRCODE_DIAGNOSIS: Record<
  number,
  { hint: string; keys: string[] }
> = {
  40013: {
    hint: 'AppID 不正确：请核对填写的 AppID 与微信公众平台后台一致',
    keys: ['wechatAppId'],
  },
  40125: {
    hint: 'AppSecret 不正确：请核对与 AppID 匹配（建议从后台重新复制）',
    keys: ['wechatAppSecret'],
  },
  40001: {
    hint: 'AppID 或 AppSecret 不正确，或该公众号/小程序尚未开通接口',
    keys: ['wechatAppId', 'wechatAppSecret'],
  },
};

@Injectable()
export class WechatChannelTestAction implements ChannelTestAction {
  readonly channel = 'wechat';

  async test(ctx: ChannelTestContext): Promise<ChannelTestResult> {
    const [appId, appSecret] = await Promise.all([
      ctx.getValue<string>('wechatAppId'),
      ctx.getValue<string>('wechatAppSecret'),
    ]);

    const missing = [
      !appId && 'wechatAppId',
      !appSecret && 'wechatAppSecret',
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      return {
        ok: false,
        message: `微信凭据不完整（缺失：${missing.join('、')}）`,
        problemKeys: missing,
      };
    }

    const url =
      'https://api.weixin.qq.com/cgi-bin/token?' +
      `grant_type=client_credential&appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(appSecret)}`;

    let data: { access_token?: string; errcode?: number; errmsg?: string };
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(CHANNEL_TEST_REQUEST_TIMEOUT_MS),
      });
      data = (await response.json()) as typeof data;
    } catch (error) {
      return {
        ok: false,
        message: `微信 gettoken 探测失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (data.errcode === undefined) {
      return {
        ok: true,
        verdict: 'probe',
        message: '微信凭据探测通过（gettoken 获取 access_token 成功）',
      };
    }

    // 凭据有效但接口未授权：IP 未加白名单 / API 未开通——凭据本身没问题。
    // 结论仍是 probe：凭据可用，但接口可用性只探测到「被平台拒绝」这一步
    if (data.errcode === 40163 || data.errcode === 48001) {
      return {
        ok: true,
        verdict: 'probe',
        message: `凭据有效，但接口未授权（errcode ${data.errcode}：${data.errmsg ?? ''}）——请检查 IP 白名单或 API 开通状态`,
      };
    }

    const diagnosis = WECHAT_ERRCODE_DIAGNOSIS[data.errcode];
    return {
      ok: false,
      message: diagnosis
        ? `微信凭据探测失败（errcode ${data.errcode}：${data.errmsg ?? '未知错误'}）——${diagnosis.hint}`
        : `微信凭据探测失败（errcode ${data.errcode}）：${data.errmsg ?? '未知错误'}`,
      problemKeys: diagnosis?.keys,
    };
  }
}
