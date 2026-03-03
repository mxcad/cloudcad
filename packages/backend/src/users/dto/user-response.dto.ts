import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

/**
 * 用户角色 DTO
 */
export class UserRoleDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  name: string;

  @ApiProperty({ description: '角色描述', required: false })
  description?: string;

  @ApiProperty({ description: '是否为系统角色' })
  isSystem: boolean;
}

/**
 * 用户响应 DTO
 */
export class UserResponseDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;

  @ApiProperty({ description: '用户状态', enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 用户列表响应 DTO
 */
export class UserListResponseDto {
  @ApiProperty({ description: '用户列表', type: [UserResponseDto] })
  users: UserResponseDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  limit: number;

  @ApiProperty({ description: '总页数' })
  totalPages: number;
}

/**
 * 用户搜索结果 DTO
 */
export class UserSearchResultDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;
}

/**
 * 修改密码响应 DTO
 */
export class ChangePasswordResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}

/**
 * 用户资料响应 DTO
 */
export class UserProfileResponseDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;

  @ApiProperty({ description: '用户状态', enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}
