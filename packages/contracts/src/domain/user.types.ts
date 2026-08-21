export interface UserRoleRef {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ permission: string }>;
}

export interface UserRecord {
  id: string;
  email: string | null;
  username: string;
  nickname: string | null;
  avatar: string | null;
  password: string | null;
  phone: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  wechatId: string | null;
  provider: string | null;
  roleId: string | null;
  status: string;
  role: UserRoleRef | null;
  /** 软删时间戳：非 null 表示已注销（含冷静期内待清理） */
  deletedAt: Date | null;
  /** 注销来源：'SELF'=用户自助注销（冷静期内登录可自动恢复），'ADMIN'=管理员软删，null=未注销 */
  deactivatedBy: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  clientId: string | null;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}
