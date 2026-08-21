///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved. The code, documentation, and related materials of this
// software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications
// that include this software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { IpWhitelistController } from './ip-whitelist.controller';
import { IpWhitelistService } from './ip-whitelist.service';
import { IpWhitelistFileService } from './ip-whitelist-file.service';

/**
 * 管理员登录 IP 白名单模块
 *
 * 双通道：DB（管理界面 CRUD）+ 服务器本地文件（兜底，界面锁死自救），
 * 判定语义 fail-close（见 IpWhitelistService）。
 */
@Module({
  imports: [PermissionModule, AuditLogModule],
  controllers: [IpWhitelistController],
  providers: [IpWhitelistService, IpWhitelistFileService],
  exports: [IpWhitelistService, IpWhitelistFileService],
})
export class IpWhitelistModule {}
