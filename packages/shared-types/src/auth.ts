/**
 * 认证相关类型定义
 */

export interface LoginDto {
  /** 邮箱或用户名 */
  account: string;
  /** 密码 */
  password: string;
}

export interface RegisterDto {
  /** 用户邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 昵称 */
  nickname?: string;
}

export interface RefreshTokenDto {
  /** 刷新Token */
  refreshToken: string;
}

export interface AuthResponseDto {
  /** 访问Token */
  accessToken: string;
  /** 刷新Token */
  refreshToken: string;
  /** 用户信息 */
  user: {
    id: string;
    email: string;
    username: string;
    nickname?: string;
    avatar?: string;
    role: string;
    status: string;
  };
}

export interface JwtPayload {
  /** 用户ID */
  sub: string;
  /** 邮箱 */
  email: string;
  /** 用户名 */
  username: string;
  /** 角色 */
  role: string;
  /** 状态 */
  status: string;
  /** Token类型 */
  type: 'access' | 'refresh';
  /** 签发时间 */
  iat: number;
  /** 过期时间 */
  exp: number;
}