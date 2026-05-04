///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 用户服务接口令牌，用于依赖注入
 */
export const USER_SERVICE = 'USER_SERVICE';

/** 用户角色信息 */
export interface IUserRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string }[];
}

/** 创建用户后的返回类型 */
export interface ICreatedUser {
  id: string;
  email: string | null;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  role?: IUserRole | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 用户详情（包含 hasPassword 标志） */
export interface IUserDetail extends ICreatedUser {
  hasPassword: boolean;
}

/** 注销/恢复等操作的响应 */
export interface IUserActionResponse {
  message: string;
}

/**
 * 用户服务接口
 * 用于解耦 CommonModule 与 UsersModule、AuthModule 与 UsersModule 之间的循环依赖
 */
export interface IUserService {
  /** 创建用户 */
  create(dto: unknown): Promise<ICreatedUser>;

  /** 根据 ID 查询用户详情 */
  findById(id: string): Promise<IUserDetail>;

  /** 根据邮箱查询用户详情 */
  findByEmail(email: string): Promise<IUserDetail>;

  /** 更新用户信息 */
  update(id: string, dto: unknown): Promise<ICreatedUser>;

  /** 注销用户账户（软删除） */
  deactivate(userId: string, ...args: unknown[]): Promise<IUserActionResponse>;

  /** 恢复已注销的用户 */
  restore(id: string): Promise<IUserActionResponse>;
}
