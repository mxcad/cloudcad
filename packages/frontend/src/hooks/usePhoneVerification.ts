import {
  authControllerBindPhoneAndLogin,
  authControllerSendSmsCode,
} from '@/api-sdk';

export function usePhoneVerification() {
  const bindPhoneAndLogin = async () => {
    const result = await authControllerBindPhoneAndLogin();
    if (result.error) throw result.error;
    return result.data;
  };

  const sendSmsCode = async (phone: string) => {
    const result = await authControllerSendSmsCode({ body: { phone } });
    if (result.error) throw result.error;
    return result.data;
  };

  return { bindPhoneAndLogin, sendSmsCode };
}
