import { useMutation } from '@tanstack/react-query';
import { usersControllerChangePassword } from '@/api-sdk';

interface ChangePasswordParams {
  oldPassword?: string;
  newPassword: string;
  /** TOTP 动态码：管理员开启双因素总闸且已绑定时必填（后端 step-up 校验） */
  totpCode?: string;
}

export const usePasswordChange = () => {
  const changePassword = useMutation({
    mutationFn: async (params: ChangePasswordParams) => {
      const result = await usersControllerChangePassword({
        throwOnError: true,
        body: {
          oldPassword: params.oldPassword,
          newPassword: params.newPassword,
          totpCode: params.totpCode,
        },
      });
      return result;
    },
  });

  return {
    changePassword: changePassword.mutateAsync,
    loading: changePassword.isPending,
    error: changePassword.error,
  };
};
