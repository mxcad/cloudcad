import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { WechatLoginResponseDto, WechatBindResponseDto, WechatUnbindResponseDto } from './dto/wechat.dto';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { InitializationService } from '../common/services/initialization.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { IUserService } from '../common/interfaces/user-service.interface';
import Redis from 'ioredis';
import { SessionRequest } from './interfaces/jwt-payload.interface';
import { RegistrationService } from './services/registration.service';
import { PasswordService } from './services/password.service';
import { AccountBindingService } from './services/account-binding.service';
import { AuthTokenService } from './services/auth-token.service';
import { IAuthProvider } from './interfaces/auth-provider.interface';
export declare class AuthFacadeService {
    private prisma;
    private jwtService;
    private configService;
    private tokenBlacklistService;
    private emailVerificationService;
    private smsVerificationService;
    private initializationService;
    private runtimeConfigService;
    private readonly userService;
    private readonly redis;
    private registrationService;
    private passwordService;
    private accountBindingService;
    private authTokenService;
    private readonly authProvider;
    private readonly logger;
    constructor(prisma: DatabaseService, jwtService: JwtService, configService: ConfigService, tokenBlacklistService: TokenBlacklistService, emailVerificationService: EmailVerificationService, smsVerificationService: SmsVerificationService, initializationService: InitializationService, runtimeConfigService: RuntimeConfigService, userService: IUserService, redis: Redis, registrationService: RegistrationService, passwordService: PasswordService, accountBindingService: AccountBindingService, authTokenService: AuthTokenService, authProvider: IAuthProvider);
    register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
    verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    login(loginDto: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
    loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    registerByPhone(registerDto: RegisterDto & {
        phone: string;
        code: string;
    }, req?: SessionRequest): Promise<AuthResponseDto>;
    loginWithWechat(code: string, state: string): Promise<WechatLoginResponseDto>;
    refreshToken(refreshToken: string): Promise<AuthResponseDto>;
    logout(userId: string, accessToken?: string, req?: any): Promise<void>;
    revokeToken(token: string): Promise<void>;
    generateTokens(user: any): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
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
    sendBindEmailCode(userId: string, email: string, isRebind?: boolean): Promise<{
        message: string;
    }>;
    verifyBindEmail(userId: string, email: string, code: string): Promise<{
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
    sendUnbindEmailCode(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyUnbindEmailCode(userId: string, code: string): Promise<{
        success: boolean;
        message: string;
        token: string;
    }>;
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
    deleteAllRefreshTokens(userId: string): Promise<void>;
    verifyPhoneAndLogin(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    bindEmailAndLogin(tempToken: string, email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    bindPhoneAndLogin(tempToken: string, phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
    verifyEmailAndRegisterPhone(email: string, emailCode: string, registerData: {
        phone: string;
        code: string;
        username: string;
        password: string;
        nickname?: string;
    }, req?: SessionRequest): Promise<AuthResponseDto>;
}
//# sourceMappingURL=auth-facade.service.d.ts.map