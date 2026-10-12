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
import { SessionCookieWriter } from '../session-cookie.writer';
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

@ApiTags('会话转移')
@Controller('auth/session-transfer')
export class SessionTransferController {
  constructor(
    private readonly sessionTransferService: SessionTransferService,
    private readonly sessionCookieWriter: SessionCookieWriter,
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
    this.sessionCookieWriter.setAuthCookies(req, response, result);
    return result;
  }
}
