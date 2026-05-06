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
        body: {
          oldPassword: params.oldPassword,
          newPassword: params.newPassword,
        },
      } as any);
      if (result.error) throw result.error;
      return result;
    },
  });

  return {
    changePassword: changePassword.mutateAsync,
    loading: changePassword.isPending,
    error: changePassword.error,
  };
};
