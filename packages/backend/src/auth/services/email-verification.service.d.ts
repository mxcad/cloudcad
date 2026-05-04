import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import Redis from 'ioredis';
export declare class EmailVerificationService {
    private readonly emailService;
    private readonly configService;
    private readonly redis;
    private readonly codeTTL;
    private readonly rateLimitTTL;
    private readonly maxVerifyAttempts;
    constructor(emailService: EmailService, configService: ConfigService, redis: Redis);
    private getCodeKey;
    private getRateLimitKey;
    private getVerifyAttemptsKey;
    generateVerificationToken(email: string): Promise<string>;
    sendVerificationEmail(email: string): Promise<void>;
    verifyEmail(email: string, code: string): Promise<{
        valid: boolean;
        message: string;
        remainingAttempts?: number;
    }>;
    resendVerificationEmail(email: string): Promise<void>;
}
//# sourceMappingURL=email-verification.service.d.ts.map