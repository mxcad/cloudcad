import { useMutation } from '@tanstack/react-query';
import {
  authControllerSendBindEmailCode,
  authControllerVerifyBindEmail,
  authControllerSendUnbindEmailCode,
  authControllerVerifyUnbindEmailCode,
  authControllerRebindEmail,
} from '@/api-sdk';

export const useEmailBind = () => {
  const sendBindCode = useMutation({
    mutationFn: async (params: { email: string; isRebind?: boolean }) => {
      const result = await authControllerSendBindEmailCode({
        body: { email: params.email, isRebind: params.isRebind },
      });
      if (result.error) throw result.error;
      return result;
    },
  });

  const verifyBindEmail = useMutation({
    mutationFn: async (params: { email: string; code: string }) => {
      const result = await authControllerVerifyBindEmail({
        body: { email: params.email, code: params.code },
      });
      if (result.error) throw result.error;
      return result;
    },
  });

  const sendUnbindCode = useMutation({
    mutationFn: async () => {
      const result = await authControllerSendUnbindEmailCode();
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  const verifyUnbindEmail = useMutation({
    mutationFn: async (params: { code: string }) => {
      const result = await authControllerVerifyUnbindEmailCode({
        body: { code: params.code },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string; token?: string };
    },
  });

  const rebindEmail = useMutation({
    mutationFn: async (params: { email: string; code: string; token: string }) => {
      const result = await authControllerRebindEmail({
        body: { email: params.email, code: params.code, token: params.token },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  return {
    sendBindCode: sendBindCode.mutateAsync,
    verifyBindEmail: verifyBindEmail.mutateAsync,
    sendUnbindCode: sendUnbindCode.mutateAsync,
    verifyUnbindEmail: verifyUnbindEmail.mutateAsync,
    rebindEmail: rebindEmail.mutateAsync,
    loading:
      sendBindCode.isPending ||
      verifyBindEmail.isPending ||
      sendUnbindCode.isPending ||
      verifyUnbindEmail.isPending ||
      rebindEmail.isPending,
  };
};
