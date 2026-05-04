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
  MinLength,
  Validate,
  IsOptional,
  IsMobilePhone,
  ValidationArguments,
} from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { IsMatch } from '../../common/decorators/validation.decorator';

export class ForgotPasswordDto {
  @ApiPropertyOptional({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: '手机号码', example: '13800138000' })
  @IsMobilePhone('zh-CN', {}, { message: '手机号格式不正确' })
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
    example: '',
  })
  @Validate(HasEmailOrPhone, { message: '必须提供邮箱或手机号' })
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
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: '手机号码', example: '13800138000' })
  @IsMobilePhone('zh-CN', {}, { message: '手机号格式不正确' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: '验证码', example: '123456' })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码至少 6 个字符' })
  @IsNotEmpty({ message: '密码不能为空' })
  newPassword: string;

  @ApiProperty({ description: '确认新密码', example: 'NewPassword123!' })
  @IsString({ message: '确认密码必须是字符串' })
  @IsNotEmpty({ message: '确认密码不能为空' })
  @Validate(IsMatch, ['newPassword'], {
    message: '两次输入的密码不一致',
  })
  confirmPassword: string;

  @ApiProperty({
    description: '验证联系方式（内部使用，用于触发邮箱或手机号验证器）',
    example: '',
  })
  @Validate(HasEmailOrPhoneReset, { message: '必须提供邮箱或手机号' })
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
  @IsString({ message: '当前密码必须是字符串' })
  @IsOptional()
  oldPassword?: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(6, { message: '新密码至少 6 个字符' })
  @IsNotEmpty({ message: '新密码不能为空' })
  newPassword: string;
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

export class ForgotPasswordApiResponseDto extends ApiResponseDto<ForgotPasswordResponseDto> {
  @ApiProperty({ type: () => ForgotPasswordResponseDto })
  declare data: ForgotPasswordResponseDto;
}

export class ResetPasswordApiResponseDto extends ApiResponseDto<ResetPasswordResponseDto> {
  @ApiProperty({ type: () => ResetPasswordResponseDto })
  declare data: ResetPasswordResponseDto;
}

export class ChangePasswordApiResponseDto extends ApiResponseDto<ChangePasswordResponseDto> {
  @ApiProperty({ type: () => ChangePasswordResponseDto })
  declare data: ChangePasswordResponseDto;
}

// 绑定邮箱相关 DTO
export class BindEmailDto {
  @ApiProperty({ description: '要绑定的邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;
}

export class VerifyBindEmailDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({ description: '验证码', example: '123456' })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;
}

export class BindEmailResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}

export class BindEmailApiResponseDto extends ApiResponseDto<BindEmailResponseDto> {
  @ApiProperty({ type: () => BindEmailResponseDto })
  declare data: BindEmailResponseDto;
}
