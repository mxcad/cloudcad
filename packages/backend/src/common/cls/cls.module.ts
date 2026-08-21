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

import { Module, Global } from '@nestjs/common';
import { ClsModule as NestClsModule } from 'nestjs-cls';
import * as crypto from 'crypto';
import { getClientIp } from '../utils/client-ip';

@Global()
@Module({
  imports: [
    NestClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req, res) => {
          cls.set('requestId', req.headers['x-request-id'] || req.headers['x-correlation-id'] || crypto.randomUUID());
          cls.set('traceId', req.headers['x-trace-id'] || crypto.randomUUID());
          cls.set('clientIp', getClientIp(req));
          cls.set('userAgent', req.headers['user-agent'] || 'unknown');
        },
      },
      interceptor: {
        mount: true,
        setup: (cls, context) => {
          const ctx = context.switchToHttp();
          const req = ctx.getRequest();
          cls.set('requestId', req.headers['x-request-id'] || req.headers['x-correlation-id'] || crypto.randomUUID());
          cls.set('traceId', req.headers['x-trace-id'] || crypto.randomUUID());
          cls.set('clientIp', getClientIp(req));
          cls.set('userAgent', req.headers['user-agent'] || 'unknown');
        },
      },
    }),
  ],
  exports: [NestClsModule],
})
export class ClsModule {}