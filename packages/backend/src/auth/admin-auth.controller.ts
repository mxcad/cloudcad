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

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { LoginDto, AuthApiResponseDto } from './dto/auth.dto';
import type { SessionRequest } from './interfaces/jwt-payload.interface';
import { Public } from './decorators/public.decorator';
import { AdminAuthService } from './impl/services/admin-auth.service';
import {
  getAdminClientIp,
  sanitizeTrustedProxies,
} from '../common/utils/client-ip';
import { SessionCookieWriter } from './session-cookie.writer';

/** 管理员登录请求：同时具备 express headers（IP 提取）与 Session（会话写回） */
type AdminLoginRequest = ExpressRequest & SessionRequest;

/**
 * 管理员专用登录入口
 *
 * 与普通登录（POST /auth/login）隔离：
 * - 仅 ADMIN 角色 + IP 白名单（DB ∪ 服务器本地文件，fail-close）可通过；
 * - 普通登录入口对 ADMIN 账号一律返回防枚举通用错误（见 LoginService）。
 */
@ApiTags('管理员认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly configService: ConfigService,
    private readonly sessionCookieWriter: SessionCookieWriter
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理员登录（IP 白名单 + 仅 ADMIN 角色）' })
  @ApiResponse({
    status: 200,
    description: '登录成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 401, description: '账号或密码错误（防枚举统一文案）' })
  @ApiResponse({ status: 403, description: '当前 IP 不在管理员白名单中' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: AdminLoginRequest,
    @Res({ passthrough: true }) response: ExpressResponse
  ): Promise<AuthApiResponseDto> {
    // 安全 IP 提取：白名单判定基于真实连接地址（+ 可信代理的 XFF 最右项），
    // 客户端伪造 X-Forwarded-For 头无法绕过白名单
    const trustedProxies = sanitizeTrustedProxies(
      (
        this.configService.get('adminIpWhitelist.trustedProxies') as
          | string[]
          | undefined
      ) ?? ['127.0.0.1', '::1']
    );
    const clientIp = getAdminClientIp(req, trustedProxies);
    const result = await this.adminAuthService.login(loginDto, req, clientIp);
    this.sessionCookieWriter.setAuthCookies(req, response, result);
    return result;
  }
}
