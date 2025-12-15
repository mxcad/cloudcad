import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/types/request.types';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { Public } from './decorators/public.decorator';
import {
  AuthApiResponseDto,
  AuthResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';
import {
  VerifyEmailDto,
  SendVerificationResponseDto,
  VerifyEmailResponseDto,
  VerifyEmailApiResponseDto,
  SendVerificationApiResponseDto,
} from './dto/email-verification.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({
    status: 201,
    description: '注册成功，请查收验证邮件',
    schema: {
      example: {
        message: '注册成功，请查看邮箱并点击验证链接完成注册',
        email: 'user@example.com'
      }
    }
  })
  @ApiResponse({ status: 409, description: '邮箱或用户名已存在' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async register(@Body() registerDto: RegisterDto): Promise<{ message: string; email: string }> {
    return this.authService.register(registerDto);
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
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
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
  async logout(@Request() req: AuthenticatedRequest): Promise<{ message: string }> {
    await this.authService.logout(req.user.id);
    return { message: '登出成功' };
  }

  @Get('profile')
  @ApiOperation({ summary: '获取用户信息' })
  @ApiResponse({
    status: 200,
    description: '获取用户信息成功',
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
  async sendVerification(@Body() dto: { email: string }): Promise<SendVerificationResponseDto> {
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
    type: VerifyEmailApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '验证码无效或已过期' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    return this.authService.verifyEmailAndActivate(dto.email, dto.code);
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
  async resendVerification(@Body() dto: { email: string }): Promise<SendVerificationResponseDto> {
    await this.emailVerificationService.resendVerificationEmail(dto.email);
    return { message: '验证邮件已重新发送' };
  }
}
