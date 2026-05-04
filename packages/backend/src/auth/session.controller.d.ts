import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
declare module 'express-session' {
    interface SessionData {
        user?: {
            id: string;
            email: string;
            username: string;
            role: string;
        };
    }
}
export declare class SessionController {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService);
    /**
     * 设置用户 Session
     */
    createSession(req: Request, body: {
        user: {
            id: string;
            email: string;
            username: string;
            role: string;
        };
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 获取当前 Session 用户信息
     */
    getSessionUser(req: Request): Promise<{
        success: boolean;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            email: string;
            username: string;
            role: string;
        };
        message?: undefined;
    }>;
    /**
     * 清除 Session
     */
    destroySession(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=session.controller.d.ts.map