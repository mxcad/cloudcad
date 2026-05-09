import {
  authControllerResendVerification,
  authControllerBindEmailAndLogin,
  authControllerVerifyEmailAndRegisterPhone,
} from '@/api-sdk';

export function useEmailVerification() {
  const resendVerification = async (data: { tempToken: string }) => {
    const result = await authControllerResendVerification({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  const bindEmailAndLogin = async (data: { tempToken: string; email: string; code: string }) => {
    const result = await authControllerBindEmailAndLogin({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  const verifyEmailAndRegisterPhone = async (data: { tempToken: string; email: string; code: string }) => {
    const result = await authControllerVerifyEmailAndRegisterPhone({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  return { resendVerification, bindEmailAndLogin, verifyEmailAndRegisterPhone };
}
