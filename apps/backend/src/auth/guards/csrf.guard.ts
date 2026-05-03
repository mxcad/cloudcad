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
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_CSRF_PROTECTED_KEY } from '../decorators/csrf-protected.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
    const csrfToken = request.headers['x-csrf-token'] as string;

    if (!csrfToken) {
      throw new ForbiddenException('CSRF token is required');
    }

    if (typeof csrfToken !== 'string' || csrfToken.length < 16 || csrfToken.length > 256) {
      throw new ForbiddenException('Invalid CSRF token format');
    }

    return true;
  }
}
