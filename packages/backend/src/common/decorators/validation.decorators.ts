import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 强密码验证装饰器 - 统一密码策略
 * 要求: 8-50位，包含大小写字母、数字和特殊字符
 */
export function IsStrongPassword() {
  const passwordPattern =
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,50}$';

  return applyDecorators(
    ApiProperty({
      description: '密码',
      example: 'Password123!',
      minLength: 8,
      maxLength: 50,
      pattern: passwordPattern,
    }),
    IsString({ message: '密码必须是字符串' }),
    IsNotEmpty({ message: '密码不能为空' }),
    MinLength(8, { message: '密码至少8个字符' }),
    MaxLength(50, { message: '密码最多50个字符' }),
    Matches(new RegExp(passwordPattern), {
      message:
        '密码必须包含至少1个大写字母、1个小写字母、1个数字和1个特殊字符',
    }),
  );
}

/**
 * 用户名验证装饰器
 */
export function IsUsername() {
  return applyDecorators(
    ApiProperty({
      description: '用户名',
      example: 'username',
      minLength: 3,
      maxLength: 20,
      pattern: '^[a-zA-Z0-9_]+$',
    }),
    IsString({ message: '用户名必须是字符串' }),
    IsNotEmpty({ message: '用户名不能为空' }),
    MinLength(3, { message: '用户名至少3个字符' }),
    MaxLength(20, { message: '用户名最多20个字符' }),
    Matches(/^[a-zA-Z0-9_]+$/, {
      message: '用户名只能包含字母、数字和下划线',
    }),
  );
}

/**
 * 邮箱验证装饰器
 */
export function IsEmailField() {
  return applyDecorators(
    ApiProperty({
      description: '用户邮箱',
      example: 'user@example.com',
      format: 'email',
    }),
    IsEmail({}, { message: '请输入有效的邮箱地址' }),
    IsNotEmpty({ message: '邮箱不能为空' }),
  );
}

/**
 * 昵称验证装饰器
 */
export function IsNickname() {
  return applyDecorators(
    ApiProperty({
      description: '昵称',
      example: '用户昵称',
      required: false,
      maxLength: 50,
    }),
    IsString({ message: '昵称必须是字符串' }),
    MaxLength(50, { message: '昵称最多50个字符' }),
  );
}
