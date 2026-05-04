import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { RegisterDto, AuthResponseDto } from '../dto/auth.dto';
import { EmailVerificationService } from './email-verification.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { IUserService } from '../../common/interfaces/user-service.interface';
import { AuthTokenService } from './auth-token.service';
import Redis from 'ioredis';
import { SessionRequest } from '../interfaces/jwt-payload.interface';
export declare class RegistrationService {
    private prisma;
    private jwtService;
    private configService;
    private emailVerificationService;
    private runtimeConfigService;
    private readonly userService;
    private authTokenService;
    private readonly redis;
    private readonly logger;
    constructor(prisma: DatabaseService, jwtService: JwtService, configService: ConfigService, emailVerificationService: EmailVerificationService, runtimeConfigService: RuntimeConfigService, userService: IUserService, authTokenService: AuthTokenService, redis: Redis);
    register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
    verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
}
//# sourceMappingURL=registration.service.d.ts.map