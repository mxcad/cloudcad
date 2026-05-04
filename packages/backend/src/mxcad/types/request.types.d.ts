import type { Request as ExpressRequest } from 'express';
import type { AuthenticatedUser } from '../../common/types/request.types';
/**
 * 扩展 Express Request 类型，添加自定义属性
 */
export interface AuthenticatedRequest extends Omit<ExpressRequest, 'session'> {
    /** 用户信息 */
    user?: AuthenticatedUser;
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
//# sourceMappingURL=request.types.d.ts.map