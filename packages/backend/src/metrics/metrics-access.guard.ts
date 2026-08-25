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

import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';

/**
 * /metrics 访问控制 Guard（#315）
 *
 * - 抓取令牌认证通过（JwtStrategyExecutor 已标记 request.isScrapeAuth）→ 直接放行，
 *   满足 Prometheus 无状态抓取（等保 8.5.4 c 监控数据访问控制）；
 * - 其余请求（含未配置 SCRAPE_TOKEN 的全部请求）退回 SYSTEM_MONITOR 权限检查，
 *   与历史行为完全一致（JWT 用户照常访问，匿名返回 403）。
 */
@Injectable()
export class MetricsAccessGuard extends PermissionsGuard {
  constructor(
    reflector: Reflector,
    @Inject(IPERMISSION_SERVICE)
    permissionService: IPermissionService
  ) {
    super(reflector, permissionService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (request?.isScrapeAuth) {
      return true;
    }
    return super.canActivate(context);
  }
}
