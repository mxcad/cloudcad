import {
  authControllerBindPhoneAndLogin,
  authControllerSendSmsCode,
} from '@/api-sdk';

export function usePhoneVerification() {
  const bindPhoneAndLogin = async () => {
    const result = await authControllerBindPhoneAndLogin();
    if (result.error) throw result.error;
    return result.data as unknown as {
      accessToken: string;
      refreshToken: string;
      user: unknown;
    };
  };

  const sendSmsCode = async () => {
    const result = await authControllerSendSmsCode();
    if (result.error) throw result.error;
    return result.data;
  };

  return { bindPhoneAndLogin, sendSmsCode };
}
