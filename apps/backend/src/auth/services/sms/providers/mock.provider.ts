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
import { SmsProvider, SendResult } from '../interfaces/sms-provider.interface';

/**
 * Mock 短信服务商
 *
 * 用于开发和测试环境，不发送真实短信，仅在日志中输出
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockSmsProvider.name);

  async sendVerificationCode(phone: string, code: string): Promise<SendResult> {
    this.logger.log(`[Mock SMS] 发送验证码到 ${phone}: ${code}`);

    return {
      success: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Mock SMS sent successfully',
    };
  }

  async sendTemplate(
    phone: string,
    templateId: string,
    params: Record<string, string>,
  ): Promise<SendResult> {
    this.logger.log(
      `[Mock SMS] 发送模板短信到 ${phone}, 模板: ${templateId}, 参数: ${JSON.stringify(params)}`,
    );

    return {
      success: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Mock SMS sent successfully',
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
