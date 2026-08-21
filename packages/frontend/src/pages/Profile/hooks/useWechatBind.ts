import { useMutation } from '@tanstack/react-query';
import {
  authControllerBindWechat,
  authControllerUnbindWechat,
} from '@/api-sdk';
import type { BindWechatDto } from '@/api-sdk';

/**
 * 绑定微信 409 冲突判断（后端异常过滤器统一包装 code='CONFLICT'）。
 * 冲突时可询问用户是否接管绑定（takeover=true 重试）。
 */
export const isWechatBindConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  return (error as Record<string, unknown>).code === 'CONFLICT';
};

export const useWechatBind = () => {
  const bindWechat = useMutation({
    mutationFn: async (params: {
      code: string;
      state: string;
      takeover?: boolean;
    }) => {
      const result = await authControllerBindWechat({
        body: {
          code: params.code,
          state: params.state,
          ...(params.takeover ? { takeover: true } : {}),
        } satisfies BindWechatDto,
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
