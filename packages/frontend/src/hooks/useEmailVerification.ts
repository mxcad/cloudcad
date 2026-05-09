import {
  authControllerResendVerification,
  authControllerBindEmailAndLogin,
  authControllerVerifyEmailAndRegisterPhone,
} from '@/api-sdk';

export function useEmailVerification() {
  const resendVerification = async (data: { email: string }) => {
    const result = await authControllerResendVerification({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  const bindEmailAndLogin = async (data: { tempToken: string; email: string; code: string }) => {
    const result = await authControllerBindEmailAndLogin({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  const verifyEmailAndRegisterPhone = async (data: { email: string; code: string; phone: string; phoneCode: string; username: string; password: string; nickname?: string }) => {
    const result = await authControllerVerifyEmailAndRegisterPhone({ body: data });
    if (result.error) throw result.error;
    return result.data;
  };

  return { resendVerification, bindEmailAndLogin, verifyEmailAndRegisterPhone };
}
