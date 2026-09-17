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
  wechatId?: string | null;
  provider?: string;
  role?: IUserRole | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  /** #416 口令最后修改时间（null=初始管理员首登未改密） */
  passwordChangedAt?: Date | null;
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

  /**
   * 同步微信头像到本地存储：下载微信头像并落盘，成功后把用户 avatar 更新为本地 URL。
   * 微信头像域名无法直接访问时降级（保留原值），永不抛错。
   * @returns 本地头像 URL；下载/落盘失败返回 null
   */
  syncWechatAvatar(
    userId: string,
    wechatAvatarUrl: string
  ): Promise<string | null>;

  /** 注销用户账户（软删除） */
  deactivate(userId: string, ...args: unknown[]): Promise<IUserActionResponse>;

  /** 恢复已注销的用户 */
  restore(id: string): Promise<IUserActionResponse>;
}
