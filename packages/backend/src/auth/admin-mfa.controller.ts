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
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { I18nContext } from 'nestjs-i18n';
import { MfaService } from './services/mfa.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { getClientIp } from '../common/utils/client-ip';

/** TOTP 首码验证请求 */
export class MfaBindDto {
  @ApiProperty({
    description: '验证器 App 当前 6 位动态码',
    example: '123456',
  })
  @IsString({ message: '动态码必须是字符串' })
  @MinLength(6, { message: '动态码至少6位' })
  @MaxLength(8, { message: '动态码最多8位' })
  code: string;
}

/** TOTP 绑定准备响应 */
export class MfaSetupResponseDto {
  @ApiProperty({
    description: 'TOTP 密钥（Base32，前端据此渲染二维码）',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'otpauth 链接（验证器 App 扫码内容，RFC 6238）',
    example: 'otpauth://totp/CloudCAD:admin?secret=...&issuer=CloudCAD',
  })
  otpauthUrl: string;
}

/**
 * 管理员 TOTP 双因素绑定端点（#415 等保 8.1.4.1(d)）
 *
 * - 仅 ADMIN 角色可访问（RolesGuard）；
 * - 未绑定 TOTP 的管理员在 JwtStrategy 层被锁定至本控制器路径 + profile/登出，
 *   绑定完成（totpEnabled=true）后锁定自动解除；
 * - bind 成功写 MFA_BIND 审计；解绑仅走运维 CLI（MFA_UNBIND 审计，无 UI 入口）。
 */
@ApiTags('管理员双因素认证')
@ApiBearerAuth()
@Controller('admin/auth/mfa')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminMfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly auditLogService: AuditLogService
  ) {}

  /**
   * 绑定准备：生成（或复用未启用的既有）密钥并密文存库，
   * 返回明文密钥与 otpauth 链接供前端渲染二维码。
   */
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'TOTP 绑定准备：生成/复用密钥并返回 otpauth 链接' })
  @ApiResponse({
    status: 200,
    description: '绑定准备成功',
    type: MfaSetupResponseDto,
  })
  @ApiResponse({ status: 409, description: 'TOTP 已启用，无需重复绑定' })
  async setup(@Req() req: ExpressRequest): Promise<MfaSetupResponseDto> {
    const user = req.user as { id: string; username: string };
    if (await this.mfaService.isTotpEnabled(user.id)) {
      throw new ConflictException(
        I18nContext.current()?.t('error.mfa.already_enabled') ??
          'TOTP 已启用，无需重复绑定'
      );
    }
    return this.mfaService.setup(user.id);
  }

  /**
   * 首码验证并激活：验证通过则置 totpEnabled=true（后续登录必须带动态码）。
   */
  @Post('bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'TOTP 首码验证并激活' })
  @ApiResponse({ status: 200, description: '绑定激活成功' })
  @ApiResponse({ status: 401, description: '动态码错误' })
  async bind(
    @Body() dto: MfaBindDto,
    @Req() req: ExpressRequest
  ): Promise<{ mfaSetupRequired: boolean }> {
    const user = req.user as { id: string; username: string };
    const clientIp = getClientIp(req);

    if (!(await this.mfaService.bind(user.id, dto.code))) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.mfa.code_invalid') ??
          '双因素认证动态码错误，请重试'
      );
    }

    await this.auditLogService.log(
      AuditAction.MFA_BIND,
      ResourceType.USER,
      user.id,
      user.id,
      true,
      undefined,
      undefined,
      undefined,
      user.username,
      { method: 'mfa_bind' },
      clientIp,
      req.headers['user-agent'] as string | undefined
    );

    return { mfaSetupRequired: false };
  }
}
