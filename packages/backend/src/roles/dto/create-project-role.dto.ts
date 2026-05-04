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
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProjectRoleDto {
  @ApiProperty({
    description: '项目 ID（系统角色不需要）',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({ description: '角色名称', example: '项目经理' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: '角色描述',
    example: '负责项目管理',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: '权限列表',
    example: ['PROJECT_UPDATE', 'PROJECT_DELETE', 'FILE_CREATE'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
