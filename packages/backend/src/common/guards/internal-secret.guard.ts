///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  INTERNAL_SERVICE_SECRET_HEADER,
  isInternalServiceSecretValid,
} from '../utils/internal-service-auth';

/**
 * 内部服务共享密钥 Guard（#421 宿主机侧告警接入 / #419 可信内网隔离路线）
 *
 * 供宿主机运维脚本（ClamAV 扫描脚本 scan-malware.sh）调用的内部端点使用。
 * 校验请求头 X-Internal-Service-Secret 与服务端 INTERNAL_SERVICE_SECRET 一致：
 * - 服务端未配置 secret → 一律拒绝（fail-close，防止端点未配密钥即向全网开放）；
 * - 请求头缺失或与 secret 不一致 → 401。
 *
 * 使用方式：端点须同时标注 @Public()（绕过 JWT/CSRF 全局 Guard），
 * 本 Guard 是该端点的唯一鉴权层。
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  private readonly logger = new Logger(InternalSecretGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { headers: Record<string, unknown> }>();

    // Express 将 header key 统一转小写存储，须用小写 key 读取（与 storage/conversion
    // 服务入站校验 req.headers['x-internal-service-secret'] 一致）。
    const provided = request.headers[INTERNAL_SERVICE_SECRET_HEADER.toLowerCase()];
    const secret = this.configService.get<string>('INTERNAL_SERVICE_SECRET');

    if (isInternalServiceSecretValid(provided, secret)) {
      return true;
    }

    const clientIp = request.ip || 'unknown';
    this.logger.warn(`内部服务密钥校验失败（IP: ${clientIp}）`);
    throw new UnauthorizedException('内部服务密钥校验失败');
  }
}
