import { User } from '@prisma/client';

/**
 * 认证用户信息
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  roleId: string;
  status: string;
}

/**
 * 认证请求对象
 * 用于替换 @Req() req: any
 */
export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

/**
 * 文件上传请求
 */
export interface FileUploadRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
  body: Record<string, unknown>;
}

/**
 * 带查询参数的请求
 */
export interface QueryRequest<
  T = Record<string, unknown>,
> extends AuthenticatedRequest {
  query: T;
}

/**
 * 带路径参数的请求
 */
export interface ParamsRequest<
  T = Record<string, string>,
> extends AuthenticatedRequest {
  params: T;
}

/**
 * 带请求体的请求
 */
export interface BodyRequest<
  T = Record<string, unknown>,
> extends AuthenticatedRequest {
  body: T;
}
