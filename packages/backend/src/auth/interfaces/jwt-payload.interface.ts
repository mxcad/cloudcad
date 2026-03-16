/**
 * JWT Access Token Payload
 */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  type: 'access';
}

/**
 * JWT Refresh Token Payload
 */
export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
}

/**
 * 用户信息（用于生成 Token）
 */
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

/**
 * Session 请求接口
 */
export interface SessionRequest {
  session?: {
    userId?: string;
    userRole?: string;
    userEmail?: string;
  };
}
