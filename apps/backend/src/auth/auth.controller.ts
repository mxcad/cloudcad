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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  Response as ExpressResponse,
  Request as ExpressRequest,
} from 'express';
import type { AuthenticatedRequest } from '../common/types/request.types';
import type { SessionRequest } from './interfaces/jwt-payload.interface';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from '@nestjs/common';
import { AuthFacadeService } from './auth-facade.service';
import { WechatService } from './services/wechat.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { Public } from './decorators/public.decorator';
import {
  AuthApiResponseDto,
  AuthResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';
import {
  WechatBindResponseDto,
  WechatUnbindResponseDto,
} from './dto/wechat.dto';
import {
  VerifyEmailDto,
  SendVerificationResponseDto,
  SendVerificationApiResponseDto,
} from './dto/email-verification.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ForgotPasswordResponseDto,
  ResetPasswordResponseDto,
  ForgotPasswordApiResponseDto,
  ResetPasswordApiResponseDto,
  BindEmailDto,
  VerifyBindEmailDto,
  BindEmailResponseDto,
  BindEmailApiResponseDto,
} from './dto/password-reset.dto';
import { UserProfileResponseDto } from '../users/dto/user-response.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthFacadeService,
    private readonly wechatService: WechatService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly smsVerificationService: SmsVerificationService,
    private readonly configService: ConfigService
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({
    status: 201,
    description: '注册成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 409, description: '邮箱或用户名已存在' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.register(registerDto, req);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({
    status: 200,
    description: '登录成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 401, description: '账号或密码错误' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, req);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新Token' })
  @ApiResponse({
    status: 200,
    description: 'Token刷新成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 401, description: '无效的刷新Token' })
  @Public()
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登出' })
  @ApiResponse({ status: 200, description: '登出成功' })
  @ApiBearerAuth()
  async logout(
    @Request() req: AuthenticatedRequest,
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: ExpressResponse
  ): Promise<{ message: string }> {
    // 从请求头中获取 access token
    const accessToken = request.headers.authorization?.replace('Bearer ', '');
    await this.authService.logout(req.user.id, accessToken, request);

    // 清除 Cookie
    const sessionName = this.configService.get('session.name');
    response.clearCookie(sessionName);

    return { message: '登出成功' };
  }

  @Get('profile')
  @ApiOperation({ summary: '获取用户信息' })
  @ApiResponse({
    status: 200,
    description: '获取用户信息成功',
    type: UserProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiBearerAuth()
  async getProfile(@Request() req: AuthenticatedRequest) {
    return req.user;
  }

  @Post('send-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送邮箱验证码' })
  @ApiResponse({
    status: 200,
    description: '验证邮件已发送',
    type: SendVerificationApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })
  async sendVerification(
    @Body() dto: { email: string }
  ): Promise<SendVerificationResponseDto> {
    await this.emailVerificationService.sendVerificationEmail(dto.email);
    return { message: '验证邮件已发送' };
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证邮箱' })
  @ApiResponse({
    status: 200,
    description: '邮箱验证成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或已过期' })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.verifyEmailAndActivate(dto.email, dto.code, req);
  }

  @Post('verify-email-and-register-phone')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '验证邮箱并完成手机号注册' })
  @ApiResponse({
    status: 201,
    description: '注册成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或已过期' })
  @ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })
  async verifyEmailAndRegisterPhone(
    @Body()
    dto: {
      email: string;
      code: string;
      phone: string;
      phoneCode: string;
      username: string;
      password: string;
      nickname?: string;
    },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.verifyEmailAndRegisterPhone(
      dto.email,
      dto.code,
      {
        phone: dto.phone,
        code: dto.phoneCode,
        username: dto.username,
        password: dto.password,
        nickname: dto.nickname,
      },
      req
    );
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重发验证码' })
  @ApiResponse({
    status: 200,
    description: '验证邮件已重新发送',
    type: SendVerificationApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })
  async resendVerification(
    @Body() dto: { email: string }
  ): Promise<SendVerificationResponseDto> {
    await this.emailVerificationService.resendVerificationEmail(dto.email);
    return { message: '验证邮件已重新发送' };
  }

  @Post('bind-email-and-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定邮箱并登录（用于已注册但没有邮箱的用户）' })
  @ApiResponse({
    status: 200,
    description: '绑定成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })
  async bindEmailAndLogin(
    @Body() dto: { tempToken: string; email: string; code: string },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.bindEmailAndLogin(
      dto.tempToken,
      dto.email,
      dto.code,
      req
    );
  }

  @Post('bind-phone-and-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定手机号并登录（用于已注册但没有手机号的用户）' })
  @ApiResponse({
    status: 200,
    description: '绑定成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })
  async bindPhoneAndLogin(
    @Body() dto: { tempToken: string; phone: string; code: string },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.bindPhoneAndLogin(
      dto.tempToken,
      dto.phone,
      dto.code,
      req
    );
  }

  @Post('verify-phone')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证手机号（用于已注册但手机号未验证的用户）' })
  @ApiResponse({
    status: 200,
    description: '手机号验证成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或已过期' })
  async verifyPhone(
    @Body() dto: { phone: string; code: string },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.verifyPhoneAndLogin(dto.phone, dto.code, req);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘记密码' })
  @ApiResponse({
    status: 200,
    description: '密码重置验证码已发送',
    type: ForgotPasswordApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '该邮箱未注册或账号已禁用' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto
  ): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(dto.email, dto.phone);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置密码' })
  @ApiResponse({
    status: 200,
    description: '密码重置成功',
    type: ResetPasswordApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '验证码无效或已过期' })
  async resetPassword(
    @Body() dto: ResetPasswordDto
  ): Promise<ResetPasswordResponseDto> {
    return this.authService.resetPassword(
      dto.email,
      dto.phone,
      dto.code,
      dto.newPassword
    );
  }

  @Post('bind-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送绑定邮箱验证码' })
  @ApiResponse({
    status: 200,
    description: '验证码已发送',
    type: BindEmailApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '邮件服务未启用或已绑定邮箱' })
  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })
  @ApiBearerAuth()
  async sendBindEmailCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: BindEmailDto & { isRebind?: boolean }
  ): Promise<BindEmailResponseDto> {
    return this.authService.sendBindEmailCode(
      req.user.id,
      dto.email,
      dto.isRebind
    );
  }

  @Post('verify-bind-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证并绑定邮箱' })
  @ApiResponse({
    status: 200,
    description: '邮箱绑定成功',
    type: BindEmailApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '邮件服务未启用或已绑定邮箱' })
  @ApiResponse({ status: 401, description: '验证码无效或已过期' })
  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })
  @ApiBearerAuth()
  async verifyBindEmail(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifyBindEmailDto
  ): Promise<BindEmailResponseDto> {
    return this.authService.verifyBindEmail(req.user.id, dto.email, dto.code);
  }

  @Post('send-unbind-email-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送解绑邮箱验证码（验证原邮箱）' })
  @ApiResponse({
    status: 200,
    description: '验证码已发送',
    schema: {
      example: { success: true, message: '验证码已发送到原邮箱' },
    },
  })
  @ApiResponse({ status: 400, description: '未绑定邮箱或发送过于频繁' })
  @ApiBearerAuth()
  async sendUnbindEmailCode(
    @Request() req: AuthenticatedRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.sendUnbindEmailCode(req.user.id);
  }

  @Post('verify-unbind-email-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证解绑邮箱验证码' })
  @ApiResponse({
    status: 200,
    description: '验证通过，可以换绑新邮箱',
    schema: {
      example: { success: true, message: '验证通过', token: 'xxx' },
    },
  })
  @ApiResponse({ status: 400, description: '验证码错误或已过期' })
  @ApiResponse({ status: 401, description: '未绑定邮箱' })
  @ApiBearerAuth()
  async verifyUnbindEmailCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { code: string }
  ): Promise<{ success: boolean; message: string; token: string }> {
    return this.authService.verifyUnbindEmailCode(req.user.id, dto.code);
  }

  @Post('rebind-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '换绑邮箱（需要先验证原邮箱）' })
  @ApiResponse({
    status: 200,
    description: '换绑成功',
    schema: {
      example: { success: true, message: '邮箱换绑成功' },
    },
  })
  @ApiResponse({ status: 400, description: '验证码错误或未验证原邮箱' })
  @ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' })
  @ApiBearerAuth()
  async rebindEmail(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { email: string; code: string; token: string }
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.rebindEmail(
      req.user.id,
      dto.email,
      dto.code,
      dto.token
    );
  }

  // ==================== 短信验证码相关接口 ====================

  @Post('send-sms-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送短信验证码' })
  @ApiResponse({
    status: 200,
    description: '验证码已发送',
    schema: {
      example: { success: true, message: '验证码已发送' },
    },
  })
  @ApiResponse({ status: 400, description: '手机号格式不正确或发送过于频繁' })
  async sendSmsCode(
    @Body() dto: { phone: string },
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    // 提取客户端 IP（支持代理场景）
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      (req as Request & { socket?: { remoteAddress?: string } }).socket
        ?.remoteAddress ||
      'unknown';

    return this.smsVerificationService.sendVerificationCode(
      dto.phone,
      clientIp
    );
  }

  @Post('verify-sms-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证短信验证码' })
  @ApiResponse({
    status: 200,
    description: '验证结果',
    schema: {
      example: { valid: true, message: '验证成功' },
    },
  })
  @ApiResponse({ status: 400, description: '手机号格式不正确' })
  async verifySmsCode(
    @Body() dto: { phone: string; code: string }
  ): Promise<{ valid: boolean; message: string }> {
    return this.smsVerificationService.verifyCode(dto.phone, dto.code);
  }

  @Post('register-phone')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '手机号注册' })
  @ApiResponse({
    status: 201,
    description: '注册成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码错误或参数无效' })
  @ApiResponse({ status: 409, description: '手机号或用户名已存在' })
  async registerByPhone(
    @Body() registerDto: RegisterDto & { phone: string; code: string },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.registerByPhone(registerDto, req);
  }

  @Post('login-phone')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手机号验证码登录' })
  @ApiResponse({
    status: 200,
    description: '登录成功',
    type: AuthApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码错误' })
  @ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })
  async loginByPhone(
    @Body() dto: { phone: string; code: string },
    @Req() req: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.authService.loginByPhone(dto.phone, dto.code, req);
  }

  @Post('bind-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定手机号' })
  @ApiResponse({
    status: 200,
    description: '绑定成功',
    schema: {
      example: { success: true, message: '手机号绑定成功' },
    },
  })
  @ApiResponse({ status: 400, description: '验证码错误或已绑定手机号' })
  @ApiResponse({ status: 409, description: '手机号已被其他用户绑定' })
  @ApiBearerAuth()
  async bindPhone(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { phone: string; code: string }
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.bindPhone(req.user.id, dto.phone, dto.code);
  }

  @Post('send-unbind-phone-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送解绑手机号验证码（验证原手机号）' })
  @ApiResponse({
    status: 200,
    description: '验证码已发送',
    schema: {
      example: { success: true, message: '验证码已发送到原手机号' },
    },
  })
  @ApiResponse({ status: 400, description: '未绑定手机号或发送过于频繁' })
  @ApiBearerAuth()
  async sendUnbindPhoneCode(
    @Request() req: AuthenticatedRequest
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.sendUnbindPhoneCode(req.user.id);
  }

  @Post('verify-unbind-phone-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证解绑手机号验证码' })
  @ApiResponse({
    status: 200,
    description: '验证通过，可以换绑新手机号',
    schema: {
      example: { success: true, message: '验证通过', token: 'xxx' },
    },
  })
  @ApiResponse({ status: 400, description: '验证码错误或已过期' })
  @ApiResponse({ status: 401, description: '未绑定手机号' })
  @ApiBearerAuth()
  async verifyUnbindPhoneCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { code: string }
  ): Promise<{ success: boolean; message: string; token: string }> {
    return this.authService.verifyUnbindPhoneCode(req.user.id, dto.code);
  }

  @Post('rebind-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '换绑手机号（需要先验证原手机号）' })
  @ApiResponse({
    status: 200,
    description: '换绑成功',
    schema: {
      example: { success: true, message: '手机号换绑成功' },
    },
  })
  @ApiResponse({ status: 400, description: '验证码错误或未验证原手机号' })
  @ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' })
  @ApiBearerAuth()
  async rebindPhone(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { phone: string; code: string; token: string }
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.rebindPhone(
      req.user.id,
      dto.phone,
      dto.code,
      dto.token
    );
  }

  @Post('check-field')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '检查字段唯一性（用户名、邮箱、手机号）' })
  @ApiResponse({
    status: 200,
    description: '返回各字段是否存在',
    schema: {
      example: {
        usernameExists: false,
        emailExists: false,
        phoneExists: false,
      },
    },
  })
  async checkFieldUniqueness(
    @Body() dto: { username?: string; email?: string; phone?: string }
  ): Promise<{
    usernameExists: boolean;
    emailExists: boolean;
    phoneExists: boolean;
  }> {
    return this.authService.checkFieldUniqueness(dto);
  }

  // ==================== 微信登录相关 ====================

  @Get('wechat/login')
  @Public()
  @ApiOperation({ summary: '获取微信授权 URL' })
  @ApiResponse({
    status: 200,
    description: '返回微信授权 URL',
    schema: {
      example: {
        authUrl: 'https://open.weixin.qq.com/connect/qrconnect?...',
        state: 'random_state_string',
      },
    },
  })
  async getWechatAuthUrl(
    @Query('origin') origin: string,
    @Query('isPopup') isPopup: string,
    @Query('purpose') purpose: string
  ): Promise<{ authUrl: string; state: string }> {
    // 将 origin, isPopup, purpose 编码到 state 中
    const stateData = {
      csrf: this.wechatService.generateState(),
      origin: origin || 'http://localhost:3000',
      isPopup: isPopup === 'true',
      purpose: purpose || 'login', // login | bind
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
    const authUrl = this.wechatService.getAuthUrl(state);
    return { authUrl, state };
  }

  @Get('wechat/callback')
  @Public()
  @ApiOperation({ summary: '微信授权回调' })
  @ApiResponse({
    status: 200,
    description: '微信登录成功，重定向回前端页面',
  })
  @ApiResponse({ status: 400, description: '授权失败或参数错误' })
  async wechatCallback(
    @Req() req: ExpressRequest & { query: { code: string; state: string } },
    @Res() res: ExpressResponse
  ): Promise<void> {
    const { code, state } = req.query;

    // 解析 state 获取前端信息
    let origin = 'http://localhost:3000';
    let isPopup = false;
    let purpose = 'login';
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      origin = stateData.origin || origin;
      isPopup = stateData.isPopup || false;
      purpose = stateData.purpose || 'login';
      console.log(
        '[wechat callback] 解析 state 成功: origin=%s, isPopup=%s, purpose=%s',
        origin,
        isPopup,
        purpose
      );
    } catch (e) {
      console.log('[wechat callback] 解析 state 失败: %s', e);
    }

    // 统一的重定向函数
    const redirectToFrontend = (
      path: string,
      hashData?: Record<string, unknown>
    ) => {
      let url = `${origin}${path}`;
      if (hashData) {
        const hash = encodeURIComponent(
          JSON.stringify({ ...hashData, isPopup, purpose })
        );
        url += `#wechat_result=${hash}`;
      }
      console.log('[wechat callback] 重定向到:', url);
      res.redirect(url);
    };

    // 绑定流程 - 重定向到 Profile 页面
    if (purpose === 'bind') {
      console.log('[wechat callback] bind 流程, code:', !!code);
      if (!code) {
        redirectToFrontend('/profile', { error: '授权失败', purpose: 'bind' });
        return;
      }
      redirectToFrontend('/profile', { code, state, purpose: 'bind' });
      return;
    }

    // 注销确认流程 - 重定向到 Profile 页面
    if (purpose === 'deactivate') {
      console.log('[wechat callback] deactivate 流程, code:', !!code);
      if (!code) {
        redirectToFrontend('/profile', {
          error: '授权失败',
          purpose: 'deactivate',
        });
        return;
      }
      redirectToFrontend('/profile', { code, state, purpose: 'deactivate' });
      return;
    }

    // 登录流程
    if (!code) {
      redirectToFrontend('/login', { error: '授权失败：缺少 code' });
      return;
    }

    try {
      const result = await this.authService.loginWithWechat(code, state);
      redirectToFrontend('/login', { ...result });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      redirectToFrontend('/login', { error: errorMsg });
    }
  }

  @Post('wechat/bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '绑定微信到当前账号' })
  @ApiResponse({
    status: 200,
    description: '绑定成功',
    schema: {
      example: { success: true, message: '微信绑定成功' },
    },
  })
  @ApiResponse({ status: 400, description: '绑定失败' })
  @ApiResponse({ status: 409, description: '该微信已绑定其他账号' })
  @ApiBearerAuth()
  async bindWechat(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { code: string; state: string }
  ): Promise<WechatBindResponseDto> {
    return this.authService.bindWechat(req.user.id, dto.code, dto.state);
  }

  @Post('wechat/unbind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解绑微信' })
  @ApiResponse({
    status: 200,
    description: '解绑成功',
    schema: {
      example: { success: true, message: '微信解绑成功' },
    },
  })
  @ApiResponse({ status: 400, description: '解绑失败' })
  @ApiBearerAuth()
  async unbindWechat(
    @Request() req: AuthenticatedRequest
  ): Promise<WechatUnbindResponseDto> {
    return this.authService.unbindWechat(req.user.id);
  }
}
