import type { RegisterDto, AuthResponseDto, SessionRequest, LoginDto } from './types';

export interface IRegistrationService {
  register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
}

export interface IPasswordService {
  validateUser(email: string, password: string): Promise<Record<string, unknown> | null>;
  forgotPassword(email?: string, phone?: string): Promise<{
    message: string;
    mailEnabled: boolean;
    smsEnabled: boolean;
    supportEmail?: string;
    supportPhone?: string;
  }>;
  resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{ message: string }>;
}

export interface IAccountBindingService {
  sendBindEmailCode(userId: string, email: string, isRebind?: boolean): Promise<{ message: string }>;
  verifyBindEmail(userId: string, email: string, code: string, isRebind?: boolean): Promise<{ message: string }>;
  bindPhone(userId: string, phone: string, code: string): Promise<{ success: boolean; message: string }>;
  sendUnbindPhoneCode(userId: string): Promise<{ success: boolean; message: string }>;
  verifyUnbindPhoneCode(userId: string, code: string): Promise<{ success: boolean; message: string; token: string }>;
  rebindPhone(userId: string, phone: string, code: string, token: string): Promise<{ success: boolean; message: string }>;
  sendUnbindEmailCode(userId: string): Promise<{ success: boolean; message: string }>;
  verifyUnbindEmailCode(userId: string, code: string): Promise<{ success: boolean; message: string; token: string }>;
  rebindEmail(userId: string, email: string, code: string, token: string): Promise<{ success: boolean; message: string }>;
  bindWechat(userId: string, code: string, state: string, takeover?: boolean): Promise<{ success: boolean; message: string }>;
  unbindWechat(userId: string): Promise<{ success: boolean; message: string }>;
  unbindEmail(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  unbindPhone(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  checkFieldUniqueness(dto: { username?: string; email?: string; phone?: string }): Promise<{
    usernameExists: boolean;
    emailExists: boolean;
    phoneExists: boolean;
  }>;
}

export interface IWechatCallbackService {
  getAuthUrl(
    origin: string,
    isPopup: string,
    purpose: string,
    client: string,
    txn: string,
  ): Promise<{ authUrl: string; state: string; transactionId: string }>;
  handleCallback(req: unknown, res: unknown): Promise<void>;
  pollTransaction(txn: string, req?: unknown): Promise<{ status: string; action?: string; accessToken?: string; refreshToken?: string; user?: Record<string, unknown>; tempToken?: string; error?: string }>;
}

export interface IAuthTokenService {
  generateTokens(
    user: Record<string, unknown>,
    oldRefreshTokenToDelete?: string,
    clientId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }>;
  validateRefreshToken(token: string, userId: string): Promise<boolean>;
  deleteAllRefreshTokens(userId: string, clientId?: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<Record<string, unknown>>;
  logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void>;
  revokeToken(token: string): Promise<void>;
}
