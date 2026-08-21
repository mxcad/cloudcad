import type { LoginDto, RegisterDto, AuthResponseDto, UserDto, WechatLoginResponseDto, SessionRequest } from './types';

export interface IAuthenticationHandler {
  login(credentials: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
  register(data: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
  getUserInfo(userId: string): Promise<UserDto>;
}

export interface IOAuthHandler {
  loginByWechat(code: string, state: string): Promise<WechatLoginResponseDto>;
}

export interface ISmsAuthHandler {
  loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  registerByPhone(registerDto: RegisterDto & { phone: string; code: string }, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyPhoneAndLogin(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
}

export interface IPasswordResetHandler {
  forgotPassword(email?: string, phone?: string): Promise<{
    message: string;
    mailEnabled: boolean;
    smsEnabled: boolean;
    supportEmail?: string;
    supportPhone?: string;
  }>;
  resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{ message: string }>;
}

export interface IAccountBindingHandler {
  bindEmailAndLogin(tempToken: string, email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  bindPhoneAndLogin(tempToken: string, phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyEmailAndRegisterPhone(
    email: string,
    emailCode: string,
    registerData: { phone: string; code: string; username: string; password: string; nickname?: string },
    req?: SessionRequest
  ): Promise<AuthResponseDto>;
}

export interface ITokenHandler {
  refreshToken(token: string): Promise<AuthResponseDto>;
}

export interface IAuthProvider
  extends IAuthenticationHandler,
    IOAuthHandler,
    ISmsAuthHandler,
    IPasswordResetHandler,
    IAccountBindingHandler,
    ITokenHandler {}
