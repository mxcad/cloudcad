import { useMutation } from '@tanstack/react-query';
import {
  authControllerSendSmsCode,
  authControllerSendUnbindPhoneCode,
  authControllerVerifyUnbindPhoneCode,
  authControllerBindPhone,
  authControllerRebindPhone,
} from '@/api-sdk';

export const usePhoneBind = () => {
  const sendSmsCode = useMutation({
    mutationFn: async (params: { phone: string }) => {
      const result = await authControllerSendSmsCode({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { phone: params.phone },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  const sendUnbindPhoneCode = useMutation({
    mutationFn: async () => {
      const result = await authControllerSendUnbindPhoneCode();
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  const verifyUnbindPhone = useMutation({
    mutationFn: async (params: { code: string }) => {
      const result = await authControllerVerifyUnbindPhoneCode({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { code: params.code },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string; token?: string };
    },
  });

  const bindPhone = useMutation({
    mutationFn: async (params: { phone: string; code: string }) => {
      const result = await authControllerBindPhone({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { phone: params.phone, code: params.code },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  const rebindPhone = useMutation({
    mutationFn: async (params: { phone: string; code: string; token: string }) => {
      const result = await authControllerRebindPhone({
        // @ts-expect-error Generated API type marks body as never; backend DTO accepts body params
        body: { phone: params.phone, code: params.code, token: params.token },
      });
      if (result.error) throw result.error;
      return result.data as { success?: boolean; message?: string };
    },
  });

  return {
    sendSmsCode: sendSmsCode.mutateAsync,
    sendUnbindPhoneCode: sendUnbindPhoneCode.mutateAsync,
    verifyUnbindPhone: verifyUnbindPhone.mutateAsync,
    bindPhone: bindPhone.mutateAsync,
    rebindPhone: rebindPhone.mutateAsync,
    loading:
      sendSmsCode.isPending ||
      sendUnbindPhoneCode.isPending ||
      verifyUnbindPhone.isPending ||
      bindPhone.isPending ||
      rebindPhone.isPending,
  };
};
