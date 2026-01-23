import type { Request as ExpressRequest } from 'express';

/**
 * 扩展 Express Request 类型，添加自定义属性
 */
export interface AuthenticatedRequest extends Omit<ExpressRequest, 'session'> {
  /** 用户信息 */
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  /** 会话信息 */
  session?: {
    userId?: string;
    [key: string]: unknown;
  };
}

/**
 * MxCAD 模块的 Request 类型
 */
export type MxCadRequest = AuthenticatedRequest;
