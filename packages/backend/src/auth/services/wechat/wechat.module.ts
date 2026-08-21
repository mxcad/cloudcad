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
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../../../redis/redis.module';
import { WechatService } from '../../impl/services/wechat.service';
import { WECHAT_VERIFICATION_SERVICE } from '../../../common/interfaces/verification.interface';

/**
 * 微信服务独立模块（SmsModule 同模式）
 *
 * 供 users 模块（注销微信授权验证）等跨模块场景复用 WechatService，
 * 避免 users 直接依赖 AuthModule 造成循环（AuthModule imports UsersModule）。
 */
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    WechatService,
    { provide: WECHAT_VERIFICATION_SERVICE, useExisting: WechatService },
  ],
  exports: [WechatService, WECHAT_VERIFICATION_SERVICE],
})
export class WechatModule {}
