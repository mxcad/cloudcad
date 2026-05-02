///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 用户服务接口令牌，用于依赖注入
 */
export const USER_SERVICE = 'USER_SERVICE';

/** 创建用户后的返回类型 */
export interface ICreatedUser {
  id: string;
  email: string | null;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  role?: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: { permission: string }[];
  } | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 用户服务接口
 * 用于解耦 CommonModule 与 UsersModule、AuthModule 与 UsersModule 之间的循环依赖
 */
export interface IUserService {
  create(dto: unknown): Promise<ICreatedUser>;
}
