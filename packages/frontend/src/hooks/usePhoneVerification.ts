import {
  authControllerBindPhoneAndLogin,
  authControllerSendSmsCode,
} from '@/api-sdk';

export function usePhoneVerification() {
  const bindPhoneAndLogin = async (data: { tempToken: string; phone: string; code: string }) => {
    const result = await authControllerBindPhoneAndLogin({ body: data });
    if ((result as Record<string, unknown>).error) throw (result as Record<string, unknown>).error;
    return result.data;
  };

  const sendSmsCode = async (phone: string) => {
    const result = await authControllerSendSmsCode({ body: { phone } });
    if ((result as Record<string, unknown>).error) throw (result as Record<string, unknown>).error;
    return result.data;
  };

  return { bindPhoneAndLogin, sendSmsCode };
}
