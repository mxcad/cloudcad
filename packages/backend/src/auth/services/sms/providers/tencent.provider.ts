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
import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import {
  SmsProvider,
  SendResult,
  SmsProviderConfig,
} from '../interfaces/sms-provider.interface';

// 腾讯云短信客户端
const SmsClient = tencentcloud.sms.v20210111.Client;
type SmsClientType = InstanceType<typeof SmsClient>;

/**
 * 腾讯云短信服务商
 *
 * 使用腾讯云短信服务发送短信
 * 文档: https://cloud.tencent.com/document/api/382/55981
 */
@Injectable()
export class TencentSmsProvider implements SmsProvider {
  readonly name = 'tencent';
  private readonly logger = new Logger(TencentSmsProvider.name);

  private client: SmsClientType;
  private appId: string;
  private signName: string;
  private templateId: string;

  constructor(config: SmsProviderConfig['tencent']) {
    if (!config) {
      throw new Error('腾讯云短信配置缺失');
    }

    this.client = new SmsClient({
      credential: {
        secretId: config.secretId,
        secretKey: config.secretKey,
      },
      region: config.region || 'ap-guangzhou',
      profile: {
        signMethod: 'HmacSHA256',
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 30,
          endpoint: 'sms.tencentcloudapi.com',
        },
      },
    });

    this.appId = config.appId;
    this.signName = config.signName;
    this.templateId = config.templateId;

    this.logger.log('腾讯云短信服务商初始化成功');
  }

  /**
   * 格式化手机号（确保带国际区号）
   */
  private formatPhone(phone: string): string {
    // 腾讯云短信需要带国际区号
    if (phone.startsWith('+')) {
      return phone;
    }
    return `+86${phone}`;
  }

  async sendVerificationCode(phone: string, code: string): Promise<SendResult> {
    try {
      const formattedPhone = this.formatPhone(phone);

      const params = {
        SmsSdkAppId: this.appId,
        SignName: this.signName,
        TemplateId: this.templateId,
        PhoneNumberSet: [formattedPhone],
        TemplateParamSet: [code],
      };

      const result = await this.client.SendSms(params);

      const status = result.SendStatusSet?.[0];
      const isSuccess = status?.Code === 'Ok';

      if (isSuccess) {
        this.logger.log(`验证码发送成功: ${formattedPhone}`);
      } else {
        this.logger.warn(
          `验证码发送失败: ${formattedPhone}, 错误: ${status?.Message}`,
        );
      }

      return {
        success: isSuccess,
        messageId: status?.SerialNo,
        code: status?.Code,
        message: status?.Message,
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

      const result = await this.client.SendSms({
        SmsSdkAppId: this.appId,
        SignName: this.signName,
        TemplateId: templateId,
        PhoneNumberSet: [formattedPhone],
        TemplateParamSet: Object.values(params),
      });

      const status = result.SendStatusSet?.[0];

      return {
        success: status?.Code === 'Ok',
        messageId: status?.SerialNo,
        code: status?.Code,
        message: status?.Message,
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
    try {
      // 简单检查配置是否正确
      return !!(this.appId && this.signName && this.templateId);
    } catch {
      return false;
    }
  }
}
