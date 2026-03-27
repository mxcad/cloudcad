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
