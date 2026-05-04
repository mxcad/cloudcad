import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { WechatService } from './wechat.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';
import { WechatBindResponseDto, WechatUnbindResponseDto } from '../dto/wechat.dto';
export declare class AccountBindingService {
    private prisma;
    private jwtService;
    private configService;
    private emailVerificationService;
    private smsVerificationService;
    private wechatService;
    private runtimeConfigService;
    private authTokenService;
    private readonly logger;
    constructor(prisma: DatabaseService, jwtService: JwtService, configService: ConfigService, emailVerificationService: EmailVerificationService, smsVerificationService: SmsVerificationService, wechatService: WechatService, runtimeConfigService: RuntimeConfigService, authTokenService: AuthTokenService);
    sendBindEmailCode(userId: string, email: string, isRebind?: boolean): Promise<{
        message: string;
    }>;
    verifyBindEmail(userId: string, email: string, code: string, isRebind?: boolean): Promise<{
        message: string;
    }>;
    bindPhone(userId: string, phone: string, code: string): Promise<{
        success: boolean;
        message: string;
    }>;
    sendUnbindPhoneCode(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyUnbindPhoneCode(userId: string, code: string): Promise<{
        success: boolean;
        message: string;
        token: string;
    }>;
    rebindPhone(userId: string, phone: string, code: string, token: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 发送换绑邮箱验证码到原邮箱
     */
    sendUnbindEmailCode(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 验证原邮箱验证码，返回换绑 token
     */
    verifyUnbindEmailCode(userId: string, code: string): Promise<{
        success: boolean;
        message: string;
        token: string;
    }>;
    /**
     * 换绑新邮箱
     */
    rebindEmail(userId: string, email: string, code: string, token: string): Promise<{
        success: boolean;
        message: string;
    }>;
    bindWechat(userId: string, code: string, state: string): Promise<WechatBindResponseDto>;
    unbindWechat(userId: string): Promise<WechatUnbindResponseDto>;
    checkFieldUniqueness(dto: {
        username?: string;
        email?: string;
        phone?: string;
    }): Promise<{
        usernameExists: boolean;
        emailExists: boolean;
        phoneExists: boolean;
    }>;
}
//# sourceMappingURL=account-binding.service.d.ts.map