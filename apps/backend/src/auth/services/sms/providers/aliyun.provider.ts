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

import { Injectable, Logger } from '@nestjs/common';
import Dysmsapi20170525, * as dysmsapi from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
import {
  SmsProvider,
  SendResult,
  SmsProviderConfig,
} from '../interfaces/sms-provider.interface';

/**
 * 阿里云短信服务商
 *
 * 使用阿里云短信服务发送短信
 * 文档: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25
 */
@Injectable()
export class AliyunSmsProvider implements SmsProvider {
  readonly name = 'aliyun';
  private readonly logger = new Logger(AliyunSmsProvider.name);

  private client: Dysmsapi20170525;
  private signName: string;
  private templateCode: string;

  constructor(config: SmsProviderConfig['aliyun']) {
    if (!config) {
      throw new Error('阿里云短信配置缺失');
    }

    const openApiConfig = new OpenApi.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: 'dysmsapi.aliyuncs.com',
    });

    this.client = new Dysmsapi20170525(openApiConfig);
    this.signName = config.signName;
    this.templateCode = config.templateCode;

    this.logger.log('阿里云短信服务商初始化成功');
  }

  /**
   * 格式化手机号（移除国际区号前缀）
   */
  private formatPhone(phone: string): string {
    // 阿里云短信不需要 +86 前缀
    return phone.replace(/^\+86/, '');
  }

  async sendVerificationCode(phone: string, code: string): Promise<SendResult> {
    try {
      const formattedPhone = this.formatPhone(phone);

      const result = await this.client.sendSms(
        new dysmsapi.SendSmsRequest({
          phoneNumbers: formattedPhone,
          signName: this.signName,
          templateCode: this.templateCode,
          templateParam: JSON.stringify({ code }),
        }),
      );

      const isSuccess = result.body?.code === 'OK';

      if (isSuccess) {
        this.logger.log(`验证码发送成功: ${formattedPhone}`);
      } else {
        this.logger.warn(
          `验证码发送失败: ${formattedPhone}, 错误码: ${result.body?.code}, 错误信息: ${result.body?.message}`,
        );
      }

      return {
        success: isSuccess,
        messageId: result.body?.bizId,
        code: result.body?.code,
        message: result.body?.message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`验证码发送异常: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  async sendTemplate(
    phone: string,
    templateId: string,
    params: Record<string, string>,
  ): Promise<SendResult> {
    try {
      const formattedPhone = this.formatPhone(phone);

      const result = await this.client.sendSms(
        new dysmsapi.SendSmsRequest({
          phoneNumbers: formattedPhone,
          signName: this.signName,
          templateCode: templateId,
          templateParam: JSON.stringify(params),
        }),
      );

      const isSuccess = result.body?.code === 'OK';

      return {
        success: isSuccess,
        messageId: result.body?.bizId,
        code: result.body?.code,
        message: result.body?.message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`模板短信发送异常: ${errorMessage}`);

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    // 检查必要配置是否存在
    return !!(this.signName && this.templateCode);
  }
}
