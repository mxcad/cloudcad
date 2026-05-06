import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersControllerUpdateProfile } from '@/api-sdk';

interface ProfileUpdateData {
  username: string;
  nickname: string;
}

export const useProfileUpdate = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: ProfileUpdateData) => {
      const result = await usersControllerUpdateProfile({
        body: {
          username: data.username,
          nickname: data.nickname,
        },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });

  return {
    updateProfile: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
};
