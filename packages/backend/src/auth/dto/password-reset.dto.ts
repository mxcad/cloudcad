import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Validate,
} from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { IsMatch } from '../../common/decorators/validation.decorators';

export class ForgotPasswordDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({ description: '验证码', example: '123456' })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码至少6个字符' })
  @IsNotEmpty({ message: '密码不能为空' })
  newPassword: string;

  @ApiProperty({ description: '确认新密码', example: 'NewPassword123!' })
  @IsString({ message: '确认密码必须是字符串' })
  @IsNotEmpty({ message: '确认密码不能为空' })
  @Validate(IsMatch, ['newPassword'], {
    message: '两次输入的密码不一致',
  })
  confirmPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '旧密码', example: 'OldPassword123!' })
  @IsString({ message: '旧密码必须是字符串' })
  @IsNotEmpty({ message: '旧密码不能为空' })
  oldPassword: string;

  @ApiProperty({ description: '新密码', example: 'NewPassword123!' })
  @IsString({ message: '新密码必须是字符串' })
  @MinLength(6, { message: '新密码至少6个字符' })
  @IsNotEmpty({ message: '新密码不能为空' })
  newPassword: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
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
