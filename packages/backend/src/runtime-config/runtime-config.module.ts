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
import { BrandAssetService } from './brand-asset.service';
import { RuntimeConfigController } from './runtime-config.controller';

/**
 * 通道测试动作（ADR-0082 D4）以 useFactory 聚合注册到本模块
 * （NestJS 11 已移除 multi 注入；邮件动作见 #495）。
 */
@Module({
  imports: [PermissionModule],
  controllers: [RuntimeConfigController],
  providers: [
    RuntimeConfigService,
    ChannelCryptoService,
    ChannelTestService,
    BrandAssetService,
  ],
  exports: [
    RuntimeConfigService,
    ChannelCryptoService,
    ChannelTestService,
    BrandAssetService,
  ],
})
export class RuntimeConfigModule {}
