import { useMutation } from '@tanstack/react-query';
import {
  usersControllerDeactivateAccount,
  authControllerResendVerification,
} from '@/api-sdk';
import type { ResendVerificationDto } from '@/api-sdk';

interface DeactivateParams {
  password?: string;
  phoneCode?: string;
  emailCode?: string;
  /** 微信授权 code（后端换取 openid 与账户绑定微信比对） */
  wechatCode?: string;
}

export const useAccountDeactivate = () => {
  const deactivateAccount = useMutation({
    mutationFn: async (params: DeactivateParams) => {
      const result = await usersControllerDeactivateAccount({
        body: {
          password: params.password,
          phoneCode: params.phoneCode,
          emailCode: params.emailCode,
          wechatCode: params.wechatCode,
        },
      });
      if (result.error) throw result.error;
      return result;
    },
  });

  const resendVerification = useMutation({
    mutationFn: async (params: { email: string }) => {
      const result = await authControllerResendVerification({
        body: { email: params.email } satisfies ResendVerificationDto,
      });
      if (result.error) throw result.error;
      return result;
    },
  });

  return {
    deactivateAccount: deactivateAccount.mutateAsync,
    resendVerification: resendVerification.mutateAsync,
    loading: deactivateAccount.isPending || resendVerification.isPending,
  };
};
