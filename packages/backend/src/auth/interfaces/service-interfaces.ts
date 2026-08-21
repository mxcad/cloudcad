import type { RegisterDto, AuthResponseDto} from '../dto/auth.dto';
import type { WechatBindResponseDto, WechatUnbindResponseDto } from '../dto/wechat.dto';
import type {
  WechatAuthUrlResponseDto,
  WechatPollTransactionResponseDto,
} from '../dto/wechat.dto';
import type { SessionRequest, UserForToken } from './jwt-payload.interface';

export const REGISTRATION_SERVICE = 'REGISTRATION_SERVICE';
export const PASSWORD_SERVICE = 'PASSWORD_SERVICE';
export const ACCOUNT_BINDING_SERVICE = 'ACCOUNT_BINDING_SERVICE';
export const AUTH_TOKEN_SERVICE = 'AUTH_TOKEN_SERVICE';
export const WECHAT_CALLBACK_SERVICE = 'WECHAT_CALLBACK_SERVICE';

export interface IRegistrationService {
  register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;
  verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;
}

export interface IPasswordService {
  validateUser(email: string, password: string): Promise<Omit<UserForToken, 'password'> | null>;
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
  bindWechat(userId: string, code: string, state: string, takeover?: boolean): Promise<WechatBindResponseDto>;
  unbindWechat(userId: string): Promise<WechatUnbindResponseDto>;
  unbindEmail(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  unbindPhone(userId: string, code: string): Promise<{ success: boolean; message: string }>;
  checkFieldUniqueness(dto: { username?: string; email?: string; phone?: string }): Promise<{
    usernameExists: boolean;
    emailExists: boolean;
    phoneExists: boolean;
  }>;
}

export interface IAuthTokenService {
  generateTokens(
    user: UserForToken,
    oldRefreshTokenToDelete?: string,
    clientId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }>;
  validateRefreshToken(token: string, userId: string): Promise<boolean>;
  deleteAllRefreshTokens(userId: string, clientId?: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserForToken & { hasPassword?: boolean };
  }>;
  logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void>;
  revokeToken(token: string): Promise<void>;
}

export interface IWechatCallbackService {
  getAuthUrl(
    origin: string,
    isPopup: string,
    purpose: string,
    client: string,
    txn: string,
  ): Promise<WechatAuthUrlResponseDto>;
  handleCallback(req: unknown, res: unknown): Promise<void>;
  pollTransaction(txn: string, req?: unknown): Promise<WechatPollTransactionResponseDto>;
}
