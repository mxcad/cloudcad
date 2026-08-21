export interface IUserRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string }[];
}

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

export interface IUserDetail extends ICreatedUser {
  hasPassword: boolean;
}

export interface IUserActionResponse {
  message: string;
}

export interface IUserService {
  create(dto: unknown): Promise<ICreatedUser>;
  findById(id: string): Promise<IUserDetail>;
  findByEmail(email: string): Promise<IUserDetail>;
  update(id: string, dto: unknown): Promise<ICreatedUser>;
  deactivate(userId: string, ...args: unknown[]): Promise<IUserActionResponse>;
  restore(id: string): Promise<IUserActionResponse>;
  /**
   * 同步微信头像到本地存储：下载微信头像并落盘，成功后把用户 avatar 更新为本地 URL。
   * 微信头像域名无法直接访问时降级（保留原值），永不抛错。
   * @returns 本地头像 URL；下载/落盘失败返回 null
   */
  syncWechatAvatar(
    userId: string,
    wechatAvatarUrl: string
  ): Promise<string | null>;
}
