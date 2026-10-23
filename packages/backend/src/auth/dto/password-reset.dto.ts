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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Validate,
  IsOptional,
  IsMobilePhone,
  ValidationArguments,
} from 'class-validator';

import { IsMatch } from '../../common/decorators/validation.decorator';

import { I18nContext } from 'nestjs-i18n';
export class ForgotPasswordDto {
  @ApiPropertyOptional({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_format_invalid') ?? '邮箱格式不正确' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: '手机号码', example: '13800138000' })
  @IsMobilePhone('zh-CN', {}, { message: () => I18nContext.current()?.t('validation.phone_format_invalid') ?? '手机号格式不正确' })
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
    example: '',
  })
  @Validate(HasEmailOrPhone, { message: () => I18nContext.current()?.t('validation.email_or_phone_required') ?? '必须提供邮箱或手机号' })
  validateContact: string;
}

/**
 * 自定义验证器：确保邮箱或手机号至少提供一个
 */
function HasEmailOrPhone(value: unknown, args: ValidationArguments) {
  const dto = args.object as ForgotPasswordDto;
  return !!(dto.email || dto.phone);
}

export class ResetPasswordDto {
  @ApiPropertyOptional({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_format_invalid') ?? '邮箱格式不正确' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: '手机号码', example: '13800138000' })
  @IsMobilePhone('zh-CN', {}, { message: () => I18nContext.current()?.t('validation.phone_format_invalid') ?? '手机号格式不正确' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: '验证码', example: '123456' })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  code: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: () => I18nContext.current()?.t('validation.password_must_be_string') ?? '密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.password_required') ?? '密码不能为空' })
  newPassword: string;

  @ApiProperty({ description: '确认新密码', example: 'NewPassword123!' })
  @IsString({ message: () => I18nContext.current()?.t('validation.confirm_password_must_be_string') ?? '确认密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.confirm_password_required') ?? '确认密码不能为空' })
  @Validate(IsMatch, ['newPassword'], {
    message: () => I18nContext.current()?.t('validation.passwords_mismatch') ?? '两次输入的密码不一致',
  })
  confirmPassword: string;

  @ApiProperty({
    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
    example: '',
  })
  @Validate(HasEmailOrPhoneReset, { message: () => I18nContext.current()?.t('validation.email_or_phone_required') ?? '必须提供邮箱或手机号' })
  validateContact: string;
}

/**
 * 自定义验证器：确保邮箱或手机号至少提供一个（用于重置密码）
 */
function HasEmailOrPhoneReset(value: unknown, args: ValidationArguments) {
  const dto = args.object as ResetPasswordDto;
  return !!(dto.email || dto.phone);
}

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description: '当前密码（无密码用户可不填）',
    example: 'OldPassword123!',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.current_password_must_be_string') ?? '当前密码必须是字符串' })
  @IsOptional()
  oldPassword?: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: () => I18nContext.current()?.t('validation.new_password_must_be_string') ?? '新密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.new_password_required') ?? '新密码不能为空' })
  newPassword: string;

  // TOTP step-up（#415）：管理员开启双因素总闸且已绑定时，改密须额外提供动态码，
  // 防止「持有密码 + 有效会话」绕过第二因子改密永久接管账号。是否必填由服务端按
  // 运行时状态判定（mfaEnforceEnabled && 管理员 && totpEnabled），DTO 层仅做可选字符串校验。
  @ApiPropertyOptional({
    description: 'TOTP 动态码（管理员开启双因素且已绑定时必填，其余情况可留空）',
    example: '123456',
  })
  @IsString({ message: '动态码必须是字符串' })
  @IsOptional()
  totpCode?: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;

  @ApiProperty({ description: '邮件服务是否启用' })
  mailEnabled: boolean;

  @ApiProperty({ description: '短信服务是否启用' })
  smsEnabled: boolean;

  @ApiPropertyOptional({
    description: '客服邮箱（邮件禁用时返回）',
    nullable: true,
  })
  supportEmail?: string;

  @ApiPropertyOptional({
    description: '客服电话（邮件禁用时返回）',
    nullable: true,
  })
  supportPhone?: string;
}

export class ResetPasswordResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}

export class ForgotPasswordApiResponseDto extends ForgotPasswordResponseDto {

}

export class ResetPasswordApiResponseDto extends ResetPasswordResponseDto {

}

export class ChangePasswordApiResponseDto extends ChangePasswordResponseDto {

}

// 绑定邮箱相关 DTO
export class BindEmailDto {
  @ApiProperty({ description: '要绑定的邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_format_invalid') ?? '邮箱格式不正确' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.email_required') ?? '邮箱不能为空' })
  email: string;

  @ApiPropertyOptional({
    description: '是否为重新绑定（换绑）',
    example: false,
  })
  @IsOptional()
  @IsNotEmpty()
  isRebind?: boolean;
}

export class VerifyBindEmailDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_format_invalid') ?? '邮箱格式不正确' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.email_required') ?? '邮箱不能为空' })
  email: string;

  @ApiProperty({ description: '验证码', example: '123456' })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  code: string;
}

export class BindEmailResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}

export class BindEmailApiResponseDto extends BindEmailResponseDto {

}
