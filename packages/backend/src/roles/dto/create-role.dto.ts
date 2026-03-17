///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { RoleCategory } from '../../common/enums/permissions.enum';

export class CreateRoleDto {
  @ApiProperty({ description: '角色名称', example: '设计主管' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: '角色描述',
    example: '负责设计团队的管理工作',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    description: '角色类别',
    enum: RoleCategory,
    example: RoleCategory.CUSTOM,
    required: false,
  })
  @IsEnum(RoleCategory)
  @IsOptional()
  category?: RoleCategory;

  @ApiProperty({
    description: '角色级别（用于权限继承）',
    example: 50,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  level?: number;

  @ApiProperty({
    description: '权限列表（数据库存储格式：大写）',
    example: ['SYSTEM_USER_READ', 'SYSTEM_ROLE_READ', 'SYSTEM_FONT_READ'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  permissions: string[];
}
