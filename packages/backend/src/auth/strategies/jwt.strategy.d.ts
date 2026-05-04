import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly logger;
    private readonly configService;
    private readonly prisma;
    private readonly tokenBlacklistService;
    private readonly isDevelopment;
    constructor(configService: ConfigService, prisma: DatabaseService, tokenBlacklistService: TokenBlacklistService);
    validate(payload: {
        sub: string;
        email: string;
        username: string;
        role: string;
        type: string;
    }): Promise<{
        hasPassword: boolean;
        role: {
            name: string;
            description: string | null;
            permissions: import("@prisma/client").$Enums.Permission[];
        };
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        phone: string | null;
        phoneVerified: boolean;
        status: import("@prisma/client").$Enums.UserStatus;
        roleId: string;
        wechatId: string | null;
        provider: string;
    } | null>;
}
export {};
//# sourceMappingURL=jwt.strategy.d.ts.map