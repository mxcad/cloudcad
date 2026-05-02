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
import {
  SmsProvider,
  SmsProviderConfig,
} from '../interfaces/sms-provider.interface';
import { MockSmsProvider } from './mock.provider';
import { AliyunSmsProvider } from './aliyun.provider';
import { TencentSmsProvider } from './tencent.provider';

/**
 * 短信服务商工厂
 *
 * 根据配置创建对应的短信服务商实例
 */
@Injectable()
export class SmsProviderFactory {
  private static readonly logger = new Logger(SmsProviderFactory.name);

  /**
   * 创建短信服务商实例
   * @param config 短信配置
   * @returns 短信服务商实例
   */
  static create(config: SmsProviderConfig): SmsProvider {
    switch (config.provider) {
      case 'aliyun':
        this.logger.log('使用阿里云短信服务商');
        return new AliyunSmsProvider(config.aliyun);

      case 'tencent':
        this.logger.log('使用腾讯云短信服务商');
        return new TencentSmsProvider(config.tencent);

      case 'mock':
        this.logger.log('使用 Mock 短信服务商（开发测试模式）');
        return new MockSmsProvider();

      default:
        this.logger.warn(
          `未知的短信服务商: ${config.provider}，回退到 Mock 模式`,
        );
        return new MockSmsProvider();
    }
  }
}

export { MockSmsProvider, AliyunSmsProvider, TencentSmsProvider };
