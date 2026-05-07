import {
  authControllerResendVerification,
  authControllerBindEmailAndLogin,
  authControllerVerifyEmailAndRegisterPhone,
} from '@/api-sdk';

export function useEmailVerification() {
  const resendVerification = async () => {
    const result = await authControllerResendVerification();
    if (result.error) throw result.error;
    return result.data;
  };

  const bindEmailAndLogin = async () => {
    const result = await authControllerBindEmailAndLogin();
    if (result.error) throw result.error;
    return result.data;
  };

  const verifyEmailAndRegisterPhone = async () => {
    const result = await authControllerVerifyEmailAndRegisterPhone();
    if (result.error) throw result.error;
    return result.data;
  };

  return { resendVerification, bindEmailAndLogin, verifyEmailAndRegisterPhone };
}
