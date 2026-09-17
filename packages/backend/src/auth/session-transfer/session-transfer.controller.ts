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
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SessionTransferService } from './session-transfer.service';
import {
  SessionTransferCreateResponseDto,
  SessionTransferConsumeRequestDto,
  SessionTransferConsumeResponseDto,
} from './dto/session-transfer.dto';
import { AuthResponseDto } from '../dto/auth.dto';
import { Public } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

/**
 * 与 auth.controller.ts 的 cookie 契约保持一致（名称/路径/时效）：
 * auth_token 1h path=/；refresh_token 7d path=/api/v1/auth/refresh。
 */
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_PATH = '/';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@ApiTags('会话转移')
@Controller('auth/session-transfer')
export class SessionTransferController {
  constructor(
    private readonly sessionTransferService: SessionTransferService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @ApiOperation({ summary: '创建一次性会话转移凭证（已登录用户调用）' })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description: '转移完成后浏览器跳转路径（同源，可选）',
  })
  @ApiResponse({
    status: 200,
    description: '转移凭证创建成功',
    type: SessionTransferCreateResponseDto,
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Query('redirect') redirect?: string,
  ): Promise<SessionTransferCreateResponseDto> {
    return this.sessionTransferService.createTransfer(req.user.id, redirect);
  }

  @Post('consume')
  @HttpCode(HttpStatus.OK)
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '消费转移凭证并切换浏览器会话（前端透明路由调用）' })
  @ApiResponse({
    status: 200,
    description: '会话切换成功',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: '凭证无效或已过期' })
  async consume(
    @Body() dto: SessionTransferConsumeRequestDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: ExpressResponse,
  ): Promise<SessionTransferConsumeResponseDto> {
    const result = await this.sessionTransferService.consumeTransfer(dto.token, req);
    this.setAuthCookies(req, response, result);
    return result;
  }

  /**
   * 下发 httpOnly cookie（与 auth.controller.ts setAuthCookies 同契约）：
   * secure 属性 cookieSecure 显式设置时以显式值为准，否则按请求协议自适应。
   */
  private setAuthCookies(
    req: { secure?: boolean },
    response: ExpressResponse,
    result: { accessToken: string; refreshToken: string },
  ): void {
    const cookieSecure = this.configService.get<boolean | null>(
      'session.cookieSecure',
    );

    response.cookie(AUTH_COOKIE_NAME, result.accessToken, {
      httpOnly: true,
      secure: cookieSecure ?? req.secure ?? false,
      sameSite: 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: AUTH_COOKIE_PATH,
    });

    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: cookieSecure ?? req.secure ?? false,
      sameSite: 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE,
      path: REFRESH_COOKIE_PATH,
    });
  }
}
