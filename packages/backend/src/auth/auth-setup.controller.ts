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
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response as ExpressResponse } from 'express';
import type { SessionRequest } from './interfaces/jwt-payload.interface';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import {
  CreateFirstAdminDto,
  SetupStatusResponseDto,
} from './dto/first-admin.dto';
import { AuthApiResponseDto, AuthResponseDto } from './dto/auth.dto';
import { FirstAdminSetupService } from './services/first-admin-setup.service';
import { SessionCookieWriter } from './session-cookie.writer';

/**
 * 首启设置端点（Web 首启页后端）。
 *
 * 与 AuthController 平级的小控制器（参照 AdminAuthController 先例）：
 * 首启管理是一次性供给操作，不属于常规认证流程，不进 IAuthFacade。
 */
@ApiTags('认证')
@Controller('auth/setup')
export class AuthSetupController {
  constructor(
    private readonly firstAdminSetupService: FirstAdminSetupService,
    private readonly sessionCookieWriter: SessionCookieWriter
  ) {}

  @Get('status')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询首启状态（系统是否尚无任何用户）' })
  @ApiResponse({
    status: 200,
    description: '首启状态',
    type: SetupStatusResponseDto,
  })
  async getSetupStatus(): Promise<SetupStatusResponseDto> {
    return this.firstAdminSetupService.getSetupStatus();
  }

  @Post('first-admin')
  @Public()
  // 一次性入口也限流：逐 IP 兜底之外，服务内另有账号维度限流
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建首个管理员（仅系统零用户时可用）' })
  @ApiResponse({
    status: 201,
    description: '首个管理员创建成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 403, description: '系统已完成初始化' })
  @ApiResponse({ status: 400, description: '请求参数错误或口令不符合策略' })
  async createFirstAdmin(
    @Body() dto: CreateFirstAdminDto,
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) response: ExpressResponse
  ): Promise<AuthResponseDto> {
    const result = await this.firstAdminSetupService.createFirstAdmin(dto, req);
    this.sessionCookieWriter.setAuthCookies(req, response, result);
    return result;
  }
}
