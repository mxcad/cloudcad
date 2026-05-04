import { DatabaseService } from '../../database/database.service';
import { LoginDto, AuthResponseDto } from '../dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SessionRequest } from '../interfaces/jwt-payload.interface';
export declare class LoginService {
    private prisma;
    private emailVerificationService;
    private runtimeConfigService;
    private authTokenService;
    private tokenBlacklistService;
    private jwtService;
    private configService;
    private readonly logger;
    constructor(prisma: DatabaseService, emailVerificationService: EmailVerificationService, runtimeConfigService: RuntimeConfigService, authTokenService: AuthTokenService, tokenBlacklistService: TokenBlacklistService, jwtService: JwtService, configService: ConfigService);
    login(loginDto: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
}
//# sourceMappingURL=login.service.d.ts.map