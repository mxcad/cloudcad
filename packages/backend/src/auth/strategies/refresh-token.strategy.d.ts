import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
declare const RefreshTokenStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class RefreshTokenStrategy extends RefreshTokenStrategy_base {
    private readonly configService;
    private readonly prisma;
    private readonly tokenBlacklistService;
    constructor(configService: ConfigService, prisma: DatabaseService, tokenBlacklistService: TokenBlacklistService);
    validate(payload: {
        sub: string;
        type: string;
    }): Promise<{
        role: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            parentId: string | null;
            category: import("@prisma/client").$Enums.RoleCategory;
            level: number;
            isSystem: boolean;
        };
        id: string;
        email: string | null;
        username: string;
        nickname: string | null;
        avatar: string | null;
        status: import("@prisma/client").$Enums.UserStatus;
    }>;
}
export {};
//# sourceMappingURL=refresh-token.strategy.d.ts.map