import type { LoginDto, RegisterDto, AuthResponseDto, SessionRequest, WechatLoginResponseDto } from './types';

export interface IAuthFacade {
  register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  login(loginDto: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;
  loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  registerByPhone(registerDto: RegisterDto & { phone: string; code: string }, req?: SessionRequest): Promise<AuthResponseDto>;
  loginWithWechat(code: string, state: string): Promise<WechatLoginResponseDto>;
  refreshToken(refreshToken: string): Promise<AuthResponseDto>;
  logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void>;
  revokeToken(token: string): Promise<void>;
  generateTokens(user: Record<string, unknown>): Promise<{ accessToken: string; refreshToken: string }>;
  validateUser(email: string, password: string): Promise<Record<string, unknown> | null>;
  forgotPassword(email?: string, phone?: string): Promise<{ message: string; mailEnabled: boolean; smsEnabled: boolean; supportEmail?: string; supportPhone?: string }>;
  resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{ message: string }>;
  sendBindEmailCode(userId: string, email: string, isRebind?: boolean): Promise<{ message: string }>;
  verifyBindEmail(userId: string, email: string, code: string): Promise<{ message: string }>;
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
  checkFieldUniqueness(dto: { username?: string; email?: string; phone?: string }): Promise<{ usernameExists: boolean; emailExists: boolean; phoneExists: boolean }>;
  deleteAllRefreshTokens(userId: string): Promise<void>;
  sendVerificationEmail(email: string): Promise<void>;
  resendVerificationEmail(email: string): Promise<void>;
  sendSmsCode(phone: string, clientIp: string): Promise<{ success: boolean; message: string }>;
  verifySmsCode(phone: string, code: string): Promise<{ valid: boolean; message: string }>;
  getProfileWithMembership(user: Record<string, unknown>): Promise<unknown>;
}
