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

import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { RuntimeConfigService } from './runtime-config.service';
import { ChannelCryptoService } from './channel-crypto.service';
import { ChannelTestService } from './channel-test.service';
import { MailChannelTestAction } from './mail-channel-test-action';
import { SmsChannelTestAction } from './sms-channel-test-action';
import { WechatChannelTestAction } from './wechat-channel-test-action';
import { PaymentChannelTestAction } from './payment-channel-test-action';
import { WebhookChannelTestAction } from './webhook-channel-test-action';
import { BrandAssetService } from './brand-asset.service';
import { RuntimeConfigController } from './runtime-config.controller';
import { CHANNEL_TEST_ACTIONS } from './channel-test.service';

/**
 * 通道测试动作（ADR-0082 D4）以 useFactory 聚合注册到本模块
 * （NestJS 11 已移除 multi 注入）；新增通道时把动作类加进 inject 与返回数组。
 */
@Module({
  imports: [PermissionModule],
  controllers: [RuntimeConfigController],
  providers: [
    RuntimeConfigService,
    ChannelCryptoService,
    ChannelTestService,
    BrandAssetService,
    MailChannelTestAction,
    SmsChannelTestAction,
    WechatChannelTestAction,
    PaymentChannelTestAction,
    WebhookChannelTestAction,
    {
      provide: CHANNEL_TEST_ACTIONS,
      useFactory: (
        mail: MailChannelTestAction,
        sms: SmsChannelTestAction,
        wechat: WechatChannelTestAction,
        payment: PaymentChannelTestAction,
        webhook: WebhookChannelTestAction
      ) => [mail, sms, wechat, payment, webhook],
      inject: [
        MailChannelTestAction,
        SmsChannelTestAction,
        WechatChannelTestAction,
        PaymentChannelTestAction,
        WebhookChannelTestAction,
      ],
    },
  ],
  exports: [
    RuntimeConfigService,
    ChannelCryptoService,
    ChannelTestService,
    BrandAssetService,
  ],
})
export class RuntimeConfigModule {}
