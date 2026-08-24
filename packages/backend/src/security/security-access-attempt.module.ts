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
import { DatabaseModule } from '../database/database.module';
import { PermissionModule } from '../permission/permission.module';
import { IpWhitelistModule } from '../ip-whitelist/ip-whitelist.module';
import { IpBlacklistModule } from '../ip-blacklist/ip-blacklist.module';
import { SecurityAccessAttemptController } from './security-access-attempt.controller';
import { SecurityAccessAttemptService } from './security-access-attempt.service';

/**
 * 高危接口访问尝试记录模块
 *
 * 记录管理员登录被拒（IP 白名单拦截 / 账号不存在 / 密码错误等）的 IP，
 * 按 IP 聚合展示 + 一键拉白 / 拉黑。写入不依赖 userId，独立于 audit_logs。
 */
@Module({
  imports: [
    DatabaseModule,
    PermissionModule,
    IpWhitelistModule,
    IpBlacklistModule,
  ],
  controllers: [SecurityAccessAttemptController],
  providers: [SecurityAccessAttemptService],
  exports: [SecurityAccessAttemptService],
})
export class SecurityAccessAttemptModule {}
