///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

/**
 * 字段匹配验证器 - 验证两个字段是否相等
 */
@ValidatorConstraint({ name: 'isMatch', async: false })
export class IsMatchConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedPropertyName
    ];
    return value === relatedValue;
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints;
    return `${args.property} 必须与 ${relatedPropertyName} 相同`;
  }
}

/**
 * 字段匹配验证装饰器
 * @param property 要匹配的属性名
 * @param validationOptions 验证选项
 */
export function IsMatch(property: string, validationOptions?: object) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsMatchConstraint,
    });
  };
}

/**
 * 密码验证装饰器 - 统一密码策略
 * 要求: 8-50位
 */
export function IsStrongPassword() {
  return applyDecorators(
    ApiProperty({
      description: '密码',
      example: 'password123',
      minLength: 8,
      maxLength: 50,
    }),
    IsString({ message: '密码必须是字符串' }),
    IsNotEmpty({ message: '密码不能为空' }),
    MinLength(8, { message: '密码至少8个字符' }),
    MaxLength(50, { message: '密码最多50个字符' })
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
    })
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
    IsNotEmpty({ message: '邮箱不能为空' })
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
    MaxLength(50, { message: '昵称最多50个字符' })
  );
}
