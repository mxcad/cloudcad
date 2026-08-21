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

/**
 * 短信服务商配置
 */
export interface SmsProviderConfig {
  /** 服务商类型 */
  provider: 'aliyun' | 'tencent' | 'mock';

  /** 阿里云短信配置 */
  aliyun?: {
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
    regionId?: string;
  };

  /** 腾讯云短信配置 */
  tencent?: {
    secretId: string;
    secretKey: string;
    appId: string;
    signName: string;
    templateId: string;
    region?: string;
  };
}

/**
 * 短信发送结果
 */
export interface SendResult {
  /** 是否发送成功 */
  success: boolean;

  /** 服务商返回的消息ID */
  messageId?: string;

  /** 错误码 */
  code?: string;

  /** 错误信息 */
  message?: string;
}

/**
 * 短信服务商统一接口
 *
 * 支持多种短信服务商的统一抽象层，便于切换和扩展
 */
export interface SmsProvider {
  /** 服务商名称 */
  readonly name: string;

  /**
   * 发送验证码短信
   * @param phone 手机号（带国际区号，如 +8613800138000）
   * @param code 验证码
   * @returns 发送结果
   */
  sendVerificationCode(phone: string, code: string): Promise<SendResult>;

  /**
   * 发送模板短信
   * @param phone 手机号
   * @param templateId 模板ID
   * @param params 模板参数
   * @returns 发送结果
   */
  sendTemplate(
    phone: string,
    templateId: string,
    params: Record<string, string>
  ): Promise<SendResult>;

  /**
   * 健康检查
   * @returns 服务是否正常
   */
  healthCheck(): Promise<boolean>;
}
