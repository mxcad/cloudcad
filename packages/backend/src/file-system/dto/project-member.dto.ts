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
import { IsArray, IsString, IsNotEmpty, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * 添加项目成员 DTO
 */
export class AddProjectMemberDto {
  @ApiProperty({ description: '用户 ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: '角色 ID' })
  @IsString()
  @IsNotEmpty()
  roleId: string;
}

/**
 * 更新项目成员 DTO
 */
export class UpdateProjectMemberDto {
  @ApiProperty({ description: '项目角色 ID' })
  @IsString()
  @IsNotEmpty()
  @ValidateIf((o) => !o.roleId)
  projectRoleId: string;

  @ApiProperty({
    description: '角色ID（兼容字段，与 projectRoleId 相同）',
    required: false,
  })
  @IsString()
  @ValidateIf((o) => !o.projectRoleId)
  @Transform(({ obj, value }) => {
    // 将 roleId 的值同步到 projectRoleId
    if (value && !obj.projectRoleId) {
      obj.projectRoleId = value;
    }
    return value;
  })
  roleId?: string;
}

/**
 * 批量添加项目成员 DTO
 */
export class BatchAddProjectMembersDto {
  @ApiProperty({ description: '成员列表', type: [AddProjectMemberDto] })
  @IsArray()
  @IsNotEmpty({ each: true })
  members: AddProjectMemberDto[];
}

/**
 * 批量更新项目成员 DTO
 */
export class BatchUpdateProjectMembersDto {
  @ApiProperty({ description: '成员列表' })
  @IsArray()
  @IsNotEmpty({ each: true })
  updates: Array<{
    userId: string;
    roleId: string;
  }>;
}
