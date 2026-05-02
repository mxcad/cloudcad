///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 微信 OAuth 用户信息
 */
export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
}

/**
 * 微信 Token 响应
 */
interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信服务 - 处理微信 OAuth2 授权流程
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly callbackUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('WECHAT_APP_ID') || '';
    this.appSecret = this.configService.get<string>('WECHAT_APP_SECRET') || '';
    this.callbackUrl =
      this.configService.get<string>('WECHAT_CALLBACK_URL') || '';
  }

  /**
   * 生成微信授权 URL
   * @param state CSRF 防护状态参数
   * @returns 微信授权 URL
   */
  getAuthUrl(state: string): string {
    if (!this.appId) {
      throw new Error(
        '微信 AppID 未配置，请在 .env 文件中设置 WECHAT_APP_ID'
      );
    }
    if (!this.callbackUrl) {
      throw new Error(
        '微信回调地址未配置，请在 .env 文件中设置 WECHAT_CALLBACK_URL'
      );
    }

    const redirectUri = encodeURIComponent(this.callbackUrl);
    return (
      `https://open.weixin.qq.com/connect/qrconnect?` +
      `appid=${this.appId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=snsapi_login` +
      `&state=${state}` +
      `#wechat_redirect`
    );
  }

  /**
   * 通过授权码获取 access_token
   * @param code 微信授权码
   * @returns Token 响应
   */
  async getAccessToken(code: string): Promise<WechatTokenResponse> {
    const url =
      `https://api.weixin.qq.com/sns/oauth2/access_token?` +
      `appid=${this.appId}` +
      `&secret=${this.appSecret}` +
      `&code=${code}` +
      `&grant_type=authorization_code`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.errcode) {
        this.logger.error(`获取微信 access_token 失败: ${data.errmsg}`);
        throw new InternalServerErrorException(
          `微信授权失败: ${data.errmsg}`
        );
      }

      return data;
    } catch (error) {
      this.logger.error('获取微信 access_token 异常', error.stack);
      throw new InternalServerErrorException('微信授权服务异常');
    }
  }

  /**
   * 获取微信用户信息
   * @param accessToken access_token
   * @param openid 用户 openid
   * @returns 用户信息
   */
  async getUserInfo(
    accessToken: string,
    openid: string
  ): Promise<WechatUserInfo> {
    const url =
      `https://api.weixin.qq.com/sns/userinfo?` +
      `access_token=${accessToken}` +
      `&openid=${openid}` +
      `&lang=zh_CN`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.errcode) {
        this.logger.error(`获取微信用户信息失败: ${data.errmsg}`);
        throw new InternalServerErrorException(
          `获取用户信息失败: ${data.errmsg}`
        );
      }

      return data;
    } catch (error) {
      this.logger.error('获取微信用户信息异常', error.stack);
      throw new InternalServerErrorException('微信用户信息服务异常');
    }
  }

  /**
   * 刷新 access_token
   * @param refreshToken refresh_token
   * @returns 新的 Token 响应
   */
  async refreshAccessToken(refreshToken: string): Promise<WechatTokenResponse> {
    const url =
      `https://api.weixin.qq.com/sns/oauth2/refresh_token?` +
      `appid=${this.appId}` +
      `&grant_type=refresh_token` +
      `&refresh_token=${refreshToken}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.errcode) {
        this.logger.error(`刷新微信 access_token 失败: ${data.errmsg}`);
        throw new InternalServerErrorException(
          `刷新授权失败: ${data.errmsg}`
        );
      }

      return data;
    } catch (error) {
      this.logger.error('刷新微信 access_token 异常', error.stack);
      throw new InternalServerErrorException('微信授权服务异常');
    }
  }

  /**
   * 生成状态参数（CSRF 防护）
   * @returns 随机状态字符串
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 验证状态参数
   * @param state 状态参数
   * @returns 是否有效
   */
  validateState(state: string): boolean {
    if (typeof state !== 'string') return false;

    try {
      // 尝试解析新的 Base64 格式: { csrf: "...", origin: "..." }
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      if (stateData.csrf) {
        // 验证内部的 csrf 是否是合法的 64 位 Hex 字符串
        return typeof stateData.csrf === 'string' && stateData.csrf.length === 64;
      }
    } catch (e) {
      // 如果解析失败，说明不是 Base64 格式，尝试旧格式
    }

    // 旧格式：直接是 64 位 Hex 字符串
    return state.length === 64;
  }
}
