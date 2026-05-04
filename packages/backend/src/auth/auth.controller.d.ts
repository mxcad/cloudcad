import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import type { AuthenticatedRequest } from '../common/types/request.types';
import type { SessionRequest } from './interfaces/jwt-payload.interface';
import { AuthFacadeService } from './auth-facade.service';
import { WechatService } from './services/wechat.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SmsVerificationService } from './services/sms';
import { AuthResponseDto, LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';
import { WechatBindResponseDto, WechatUnbindResponseDto } from './dto/wechat.dto';
import { VerifyEmailDto, SendVerificationResponseDto } from './dto/email-verification.dto';
import { ForgotPasswordDto, ResetPasswordDto, ForgotPasswordResponseDto, ResetPasswordResponseDto, BindEmailDto, VerifyBindEmailDto, BindEmailResponseDto } from './dto/password-reset.dto';
import { ConfigService } from '@nestjs/config';
export declare class AuthController {
    private readonly authService;
    private readonly wechatService;
    private readonly emailVerificationService;
    private readonly smsVerificationService;
    private readonly configService;
    constructor(authService: AuthFacadeService, wechatService: WechatService, emailVerificationService: EmailVerificationService, smsVerificationService: SmsVerificationService, configService: ConfigService);
    register(registerDto: RegisterDto, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    login(loginDto: LoginDto, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    refreshToken(refreshTokenDto: RefreshTokenDto, response: ExpressResponse): Promise<AuthResponseDto>;
    logout(req: AuthenticatedRequest, request: ExpressRequest, response: ExpressResponse): Promise<{
        message: string;
    }>;
    getProfile(req: AuthenticatedRequest): Promise<import("../common/types/request.types").AuthenticatedUser>;
    sendVerification(dto: {
        email: string;
    }): Promise<SendVerificationResponseDto>;
    verifyEmail(dto: VerifyEmailDto, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    verifyEmailAndRegisterPhone(dto: {
        email: string;
        code: string;
        phone: string;
        phoneCode: string;
        username: string;
        password: string;
        nickname?: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    resendVerification(dto: {
        email: string;
    }): Promise<SendVerificationResponseDto>;
    bindEmailAndLogin(dto: {
        tempToken: string;
        email: string;
        code: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    bindPhoneAndLogin(dto: {
        tempToken: string;
        phone: string;
        code: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    verifyPhone(dto: {
        phone: string;
        code: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    forgotPassword(dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto>;
    resetPassword(dto: ResetPasswordDto): Promise<ResetPasswordResponseDto>;
    sendBindEmailCode(req: AuthenticatedRequest, dto: BindEmailDto & {
        isRebind?: boolean;
    }): Promise<BindEmailResponseDto>;
    verifyBindEmail(req: AuthenticatedRequest, dto: VerifyBindEmailDto): Promise<BindEmailResponseDto>;
    sendUnbindEmailCode(req: AuthenticatedRequest): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyUnbindEmailCode(req: AuthenticatedRequest, dto: {
        code: string;
    }): Promise<{
        success: boolean;
        message: string;
        token: string;
    }>;
    rebindEmail(req: AuthenticatedRequest, dto: {
        email: string;
        code: string;
        token: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    sendSmsCode(dto: {
        phone: string;
    }, req: Request): Promise<{
        success: boolean;
        message: string;
    }>;
    verifySmsCode(dto: {
        phone: string;
        code: string;
    }): Promise<{
        valid: boolean;
        message: string;
    }>;
    registerByPhone(registerDto: RegisterDto & {
        phone: string;
        code: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    loginByPhone(dto: {
        phone: string;
        code: string;
    }, req: SessionRequest, response: ExpressResponse): Promise<AuthResponseDto>;
    bindPhone(req: AuthenticatedRequest, dto: {
        phone: string;
        code: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    sendUnbindPhoneCode(req: AuthenticatedRequest): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyUnbindPhoneCode(req: AuthenticatedRequest, dto: {
        code: string;
    }): Promise<{
        success: boolean;
        message: string;
        token: string;
    }>;
    rebindPhone(req: AuthenticatedRequest, dto: {
        phone: string;
        code: string;
        token: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    checkFieldUniqueness(dto: {
        username?: string;
        email?: string;
        phone?: string;
    }): Promise<{
        usernameExists: boolean;
        emailExists: boolean;
        phoneExists: boolean;
    }>;
    getWechatAuthUrl(origin: string, isPopup: string, purpose: string): Promise<{
        authUrl: string;
        state: string;
    }>;
    wechatCallback(req: ExpressRequest & {
        query: {
            code: string;
            state: string;
        };
    }, res: ExpressResponse): Promise<void>;
    bindWechat(req: AuthenticatedRequest, dto: {
        code: string;
        state: string;
    }): Promise<WechatBindResponseDto>;
    unbindWechat(req: AuthenticatedRequest): Promise<WechatUnbindResponseDto>;
    /**
     * 设置 JWT Cookie，用于 <img> 标签等无法携带 Authorization 头的请求
     */
    private setAuthCookie;
}
//# sourceMappingURL=auth.controller.d.ts.map