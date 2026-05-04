import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { UserForToken } from '../interfaces/jwt-payload.interface';
export declare class AuthTokenService {
    private prisma;
    private jwtService;
    private configService;
    private tokenBlacklistService;
    private readonly logger;
    constructor(prisma: DatabaseService, jwtService: JwtService, configService: ConfigService, tokenBlacklistService: TokenBlacklistService);
    generateTokens(user: UserForToken): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    private storeRefreshToken;
    validateRefreshToken(token: string, userId: string): Promise<boolean>;
    deleteAllRefreshTokens(userId: string): Promise<void>;
    refreshToken(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: UserForToken & {
            hasPassword?: boolean;
        };
    }>;
    logout(userId: string, accessToken?: string, req?: any): Promise<void>;
    revokeToken(token: string): Promise<void>;
}
//# sourceMappingURL=auth-token.service.d.ts.map