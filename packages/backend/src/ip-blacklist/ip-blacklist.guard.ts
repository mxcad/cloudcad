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

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { I18nContext } from 'nestjs-i18n';
import { Request } from 'express';
import { getClientIp } from '../common/utils/client-ip';
import { IpBlacklistService } from './ip-blacklist.service';

/**
 * IP 黑名单全局 Guard（ADR-0044 Q3）
 *
 * - 拦截所有请求（含登录、公开接口），命中返回 403
 * - 不向请求方泄露黑名单详情（统一中性文案）
 * - 注册顺序必须在 RateLimitGuard 之前（先彻底拒绝，再限流）
 * - 开发环境豁免本地 IP（与 RateLimitGuard 一致）
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
  constructor(
    private readonly ipBlacklistService: IpBlacklistService,
    private readonly cls: ClsService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const clsIp = this.cls.get<string>('clientIp');
    const ip = clsIp && clsIp !== 'unknown' ? clsIp : getClientIp(request);

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (
      nodeEnv === 'development' &&
      (ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip === 'localhost')
    ) {
      return true;
    }

    const blocked = await this.ipBlacklistService.isBlocked(ip);
    if (blocked) {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.ip_blacklist.blocked') ?? '访问被拒绝'
      );
    }
    return true;
  }
}
