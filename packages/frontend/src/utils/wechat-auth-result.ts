export interface WechatAuthResult {
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: unknown;
  needRegister?: boolean;
  tempToken?: string;
  requireEmailBinding?: boolean;
  requirePhoneBinding?: boolean;
  isPopup?: boolean;
}

export type WechatAuthAction =
  | { type: 'error'; message: string }
  | { type: 'login'; accessToken: string; refreshToken: string; user: unknown }
  | { type: 'need_register'; tempToken: string }
  | { type: 'bind_email'; tempToken: string }
  | { type: 'bind_phone'; tempToken: string }
  | null;

export function classifyWechatAuthResult(
  result: WechatAuthResult
): WechatAuthAction {
  if (result.error) {
    return { type: 'error', message: result.error };
  }
  if (result.requireEmailBinding && result.tempToken) {
    return { type: 'bind_email', tempToken: result.tempToken };
  }
  if (result.requirePhoneBinding && result.tempToken) {
    return { type: 'bind_phone', tempToken: result.tempToken };
  }
  if (result.needRegister && result.tempToken) {
    return { type: 'need_register', tempToken: result.tempToken };
  }
  if (result.accessToken) {
    return {
      type: 'login',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || '',
      user: result.user,
    };
  }
  return null;
}
