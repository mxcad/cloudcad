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

/** 管理员登录请求：同时具备 express headers（IP 提取）与 Session（会话写回） */
type AdminLoginRequest = ExpressRequest & SessionRequest;

// Cookie 常量与 AuthController 保持一致（登录态跨入口互通，复用既有刷新链路）
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_PATH = '/';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 1000; // 1 小时，与 JWT access token 过期时间一致
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天，与 refresh token 一致

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
    private readonly configService: ConfigService
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
    this.setAuthCookies(req, response, result);
    return result;
  }

  /**
   * Cookie 设置与 AuthController 行为一致：
   * secure 显式配置优先，否则按请求协议自适应（http 不带 Secure，https 带）。
   */
  private setAuthCookies(
    req: { secure?: boolean },
    response: ExpressResponse,
    result: { accessToken: string; refreshToken?: string }
  ): void {
    const cookieSecure = this.configService.get('session.cookieSecure') as
      | boolean
      | null
      | undefined;
    const secure = cookieSecure ?? req.secure ?? false;

    response.cookie(AUTH_COOKIE_NAME, result.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: AUTH_COOKIE_PATH,
    });
    if (result.refreshToken) {
      response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: REFRESH_COOKIE_PATH,
      });
    }
  }
}
