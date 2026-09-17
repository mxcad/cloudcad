import type { LoginDto, RegisterDto, AuthResponseDto } from '../dto/auth.dto';
import type { SmsCodeScene } from '../dto/sms-verification.dto';
import type { WechatLoginResponseDto, WechatBindResponseDto, WechatUnbindResponseDto } from '../dto/wechat.dto';
import type { SessionRequest, UserForToken } from './jwt-payload.interface';
import type { AuthenticatedUser } from '../../common/types/request.types';
import type { IUserDetail } from '../../common/interfaces/user-service.interface';

export const IAUTH_FACADE = 'IAuthFacade';

/** 用户详情 + 会员信息（getProfileWithMembership 返回值） */
export interface IProfileWithMembership extends IUserDetail {
  membershipTierLevel: number;
  membershipExpiresAt: Date | null;
  isVip: boolean;
  membershipTier: string;
  /** #416 口令到期状态（仅 ADMIN 角色有值）：'first_login'=首登未改密、'expired'=到期 */
  passwordChangeRequired?: 'first_login' | 'expired';
  /** #416 口令即将到期软提示（仅 ADMIN 角色有值） */
  passwordExpiringSoon?: boolean;
}

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
  generateTokens(user: UserForToken): Promise<{ accessToken: string; refreshToken: string }>;
  validateUser(email: string, password: string): Promise<Omit<UserForToken, 'password'> | null>;
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
  bindWechat(userId: string, code: string, state: string, takeover?: boolean): Promise<WechatBindResponseDto>;
  unbindWechat(userId: string): Promise<WechatUnbindResponseDto>;
  unbindEmail(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  unbindPhone(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  checkFieldUniqueness(dto: { username?: string; email?: string; phone?: string }): Promise<{ usernameExists: boolean; emailExists: boolean; phoneExists: boolean }>;
  deleteAllRefreshTokens(userId: string): Promise<void>;
  verifyPhoneAndLogin(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  bindEmailAndLogin(tempToken: string, email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  bindPhoneAndLogin(tempToken: string, phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyEmailAndRegisterPhone(email: string, emailCode: string, registerData: { phone: string; code: string; username: string; password: string; nickname?: string }, req?: SessionRequest): Promise<AuthResponseDto>;
  sendVerificationEmail(email: string): Promise<void>;
  resendVerificationEmail(email: string): Promise<void>;
  sendSmsCode(phone: string, clientIp: string, scene?: SmsCodeScene): Promise<{ success: boolean; message: string }>;
  verifySmsCode(phone: string, code: string): Promise<{ valid: boolean; message: string }>;
  getProfileWithMembership(user: AuthenticatedUser): Promise<IProfileWithMembership>;
}
