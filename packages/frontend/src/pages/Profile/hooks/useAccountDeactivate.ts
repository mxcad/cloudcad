import { useMutation } from '@tanstack/react-query';
import {
  usersControllerDeactivateAccount,
  authControllerResendVerification,
} from '@/api-sdk';

interface DeactivateParams {
  password?: string;
  phoneCode?: string;
  emailCode?: string;
  wechatConfirm?: string;
}

export const useAccountDeactivate = () => {
  const deactivateAccount = useMutation({
    mutationFn: async (params: DeactivateParams) => {
      const result = await usersControllerDeactivateAccount({
        body: {
          password: params.password,
          phoneCode: params.phoneCode,
          emailCode: params.emailCode,
          wechatConfirm: params.wechatConfirm,
        },
      });
      if (result.error) throw result.error;
      return result;
    },
  });

  const resendVerification = useMutation({
    mutationFn: async (params: { email: string }) => {
      const result = await authControllerResendVerification({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { email: params.email },
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
