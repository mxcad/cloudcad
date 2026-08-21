export interface SessionRequest {
  session?: {
    userId?: string;
    userRole?: string;
    userEmail?: string;
    save: () => Promise<void>;
    destroy: () => Promise<void>;
  };
}

export interface UserForToken {
  id: string;
  email: string | null;
  username: string;
  role?: {
    id: string;
    name: string;
    description?: string | null;
    isSystem: boolean;
    permissions?: Array<{ permission: string }>;
  } | null;
}

export interface RegisterDto {
  email?: string;
  username: string;
  password: string;
  nickname?: string;
  wechatTempToken?: string;
}

export interface LoginDto {
  account: string;
  password: string;
}

export interface UserDto {
  id: string;
  email?: string | null;
  username: string;
  nickname?: string;
  avatar?: string;
  role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{ permission: string }>;
  };
  status: string;
  phone?: string | null;
  phoneVerified?: boolean;
  wechatId?: string | null;
  provider?: string;
  hasPassword?: boolean;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
  message?: string;
  email?: string;
  /** 注销冷静期内登录自动恢复成功标记（账户已自动取消注销） */
  restored?: boolean;
}

export interface WechatLoginUserDto {
  id: string;
  email?: string;
  username: string;
  nickname?: string;
  avatar?: string;
  wechatId?: string;
  provider: string;
  role: {
    id: string;
    name: string;
    description?: string;
    isSystem: boolean;
    permissions: Array<{ permission: string }>;
  };
  status: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
}

export interface WechatLoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: WechatLoginUserDto;
  requireEmailBinding?: boolean;
  requirePhoneBinding?: boolean;
  tempToken?: string;
  needRegister?: boolean;
  /** 注销冷静期内登录自动恢复成功标记（账户已自动取消注销） */
  restored?: boolean;
}

export interface WechatBindResponseDto {
  success: boolean;
  message: string;
}

export interface WechatUnbindResponseDto {
  success: boolean;
  message: string;
}

export interface WechatAuthUrlResponseDto {
  authUrl: string;
  state: string;
  transactionId: string;
}

export interface WechatPollTransactionResponseDto {
  status: string;
  action?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
  tempToken?: string;
  error?: string;
  /** 注销冷静期内登录自动恢复成功标记（账户已自动取消注销） */
  restored?: boolean;
  /** 登录失败业务错误码（如 ACCOUNT_DEACTIVATED），供前端据码分流弹客服框 */
  errorCode?: string;
  /** 错误码附带：注销冷静期天数 */
  graceDays?: number;
  /** 错误码附带：数据彻底删除延迟天数 */
  cleanupDays?: number;
}
