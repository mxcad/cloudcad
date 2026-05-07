import { useMutation } from '@tanstack/react-query';
import {
  authControllerBindWechat,
  authControllerUnbindWechat,
} from '@/api-sdk';

export const useWechatBind = () => {
  const bindWechat = useMutation({
    mutationFn: async (params: { code: string; state: string }) => {
      const result = await authControllerBindWechat({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { code: params.code, state: params.state },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  const unbindWechat = useMutation({
    mutationFn: async () => {
      const result = await authControllerUnbindWechat();
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  return {
    bindWechat: bindWechat.mutateAsync,
    unbindWechat: unbindWechat.mutateAsync,
    loading: bindWechat.isPending || unbindWechat.isPending,
  };
};
