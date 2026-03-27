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
import { RoleCategory } from '../../common/enums/permissions.enum';
import {
  SystemPermission,
  ProjectPermission,
} from '../../common/dto/permission.dto';

// 合并所有权限值
const ALL_PERMISSIONS = [
  ...Object.values(SystemPermission),
  ...Object.values(ProjectPermission),
];

export class RoleDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  name: string;

  @ApiProperty({ description: '角色描述', required: false })
  description?: string;

  @ApiProperty({ description: '角色类别', enum: RoleCategory })
  category: RoleCategory;

  @ApiProperty({ description: '角色级别（用于权限继承）' })
  level: number;

  @ApiProperty({ description: '是否为系统角色（不可删除）' })
  isSystem: boolean;

  @ApiProperty({
    description: '权限列表',
    type: [String],
    enum: ALL_PERMISSIONS,
    example: ['system:user:read', 'system:role:read', 'system:font:read'],
  })
  permissions: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 项目角色权限 DTO
 */
export class ProjectRolePermissionDto {
  @ApiProperty({ description: '权限 ID' })
  id: string;

  @ApiProperty({ description: '项目角色 ID' })
  projectRoleId: string;

  @ApiProperty({ description: '权限名称', enum: ProjectPermission })
  permission: ProjectPermission;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

/**
 * 项目角色 DTO
 */
export class ProjectRoleDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '项目 ID', required: false })
  projectId?: string;

  @ApiProperty({ description: '角色名称' })
  name: string;

  @ApiProperty({ description: '角色描述', required: false })
  description?: string;

  @ApiProperty({ description: '是否为系统角色' })
  isSystem: boolean;

  @ApiProperty({ description: '权限列表', type: [ProjectRolePermissionDto] })
  permissions: ProjectRolePermissionDto[];

  @ApiProperty({ description: '成员数量', required: false })
  _count?: { members: number };

  @ApiProperty({ description: '关联的项目', required: false })
  project?: { id: string; name: string };

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}
