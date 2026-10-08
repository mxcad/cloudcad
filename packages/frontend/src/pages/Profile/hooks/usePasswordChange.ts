import { useMutation } from '@tanstack/react-query';
import { usersControllerChangePassword } from '@/api-sdk';

interface ChangePasswordParams {
  oldPassword?: string;
  newPassword: string;
}

export const usePasswordChange = () => {
  const changePassword = useMutation({
    mutationFn: async (params: ChangePasswordParams) => {
      const result = await usersControllerChangePassword({
        throwOnError: true,
        body: {
          oldPassword: params.oldPassword,
          newPassword: params.newPassword,
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
