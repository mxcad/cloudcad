///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { IS_CSRF_PROTECTED_KEY } from '../decorators/csrf-protected.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ClsService } from 'nestjs-cls';
import * as crypto from 'crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);
  private readonly CSRF_COOKIE_NAME = 'csrf_token';
  private readonly CSRF_HEADER_NAME = 'x-csrf-token';

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isProtected = this.reflector.getAllAndOverride<boolean>(
      IS_CSRF_PROTECTED_KEY,
      [context.getHandler(), context.getClass()]
    );

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || !isProtected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // JWT Bearer token inherently protects against CSRF because it is sent
    // via the Authorization header — not via cookies. Browsers do not
    // automatically attach Authorization headers to cross-origin requests.
    // When a valid Bearer token is present, skip the redundant CSRF check.
    const authHeader = request.headers['authorization'] as string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token.length >= 16 && token.length <= 1024) {
        return true;
      }
      this.logger.warn(
        `Bearer token present but length unexpected (${token.length}), falling through to CSRF check`
      );
    }

    // Cookie-based authentication: require double-submit cookie pattern
    // The CSRF token must be present in both the cookie and the header
    const csrfCookie = request.cookies?.[this.CSRF_COOKIE_NAME];
    const csrfHeader = request.headers[this.CSRF_HEADER_NAME] as string;

    if (!csrfCookie || !csrfHeader) {
      const clientIp = this.cls.get<string>('clientIp') || request.ip || 'unknown';
      this.logger.warn(
        `CSRF validation failed: missing cookie or header (IP: ${clientIp})`
      );
      throw new ForbiddenException('CSRF token is required');
    }

    // Validate token format
    if (
      typeof csrfHeader !== 'string' ||
      csrfHeader.length < 16 ||
      csrfHeader.length > 256
    ) {
      const clientIp = this.cls.get<string>('clientIp') || request.ip || 'unknown';
      this.logger.warn(
        `CSRF validation failed: invalid token format (IP: ${clientIp})`
      );
      throw new ForbiddenException('Invalid CSRF token format');
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!this.timingSafeEqual(csrfCookie, csrfHeader)) {
      const clientIp = this.cls.get<string>('clientIp') || request.ip || 'unknown';
      this.logger.warn(
        `CSRF validation failed: token mismatch (IP: ${clientIp})`
      );
      throw new ForbiddenException('Invalid CSRF token');
    }

    // Generate new CSRF token for next request (rotating token pattern)
    const newCsrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(this.CSRF_COOKIE_NAME, newCsrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return true;
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }
}