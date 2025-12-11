/**
 * 用户相关类型定义
 */

import { UserRole, UserStatus } from './enums';

export interface User {
  /** 用户ID */
  id: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 昵称 */
  nickname?: string;
  /** 头像URL */
  avatar?: string;
  /** 用户角色 */
  role: UserRole;
  /** 用户状态 */
  status: UserStatus;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

export interface CreateUserDto {
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 昵称 */
  nickname?: string;
  /** 用户角色 */
  role?: UserRole;
}

export interface UpdateUserDto {
  /** 邮箱 */
  email?: string;
  /** 用户名 */
  username?: string;
  /** 密码 */
  password?: string;
  /** 昵称 */
  nickname?: string;
  /** 头像URL */
  avatar?: string;
  /** 用户角色 */
  role?: UserRole;
  /** 用户状态 */
  status?: UserStatus;
}

export interface QueryUsersDto {
  /** 搜索关键词（邮箱、用户名、昵称） */
  search?: string;
  /** 角色筛选 */
  role?: UserRole;
  /** 状态筛选 */
  status?: UserStatus;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'email' | 'username';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

export interface UserListResponse {
  /** 用户列表 */
  data: User[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页数量 */
    limit: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
  };
}

export interface UserProfile {
  /** 用户ID */
  id: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 昵称 */
  nickname?: string;
  /** 头像URL */
  avatar?: string;
  /** 用户角色 */
  role: UserRole;
  /** 用户状态 */
  status: UserStatus;
  /** 存储使用量（字节） */
  usedStorage?: number;
  /** 存储总量（字节） */
  totalStorage?: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}