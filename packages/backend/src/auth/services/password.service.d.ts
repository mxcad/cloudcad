import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
export declare class PasswordService {
    private prisma;
    private emailVerificationService;
    private smsVerificationService;
    private runtimeConfigService;
    private authTokenService;
    private tokenBlacklistService;
    private readonly logger;
    constructor(prisma: DatabaseService, emailVerificationService: EmailVerificationService, smsVerificationService: SmsVerificationService, runtimeConfigService: RuntimeConfigService, authTokenService: AuthTokenService, tokenBlacklistService: TokenBlacklistService);
    validateUser(email: string, password: string): Promise<any>;
    forgotPassword(email?: string, phone?: string): Promise<{
        message: string;
        mailEnabled: boolean;
        smsEnabled: boolean;
        supportEmail?: string;
        supportPhone?: string;
    }>;
    resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{
        message: string;
    }>;
}
//# sourceMappingURL=password.service.d.ts.map