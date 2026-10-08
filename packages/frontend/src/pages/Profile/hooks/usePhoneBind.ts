import { useMutation } from '@tanstack/react-query';
import {
  authControllerSendSmsCode,
  authControllerSendUnbindPhoneCode,
  authControllerVerifyUnbindPhoneCode,
  authControllerBindPhone,
  authControllerRebindPhone,
  authControllerUnbindPhone,
} from '@/api-sdk';
import type {
  VerifyUnbindCodeDto,
  BindPhoneDto,
  RebindPhoneDto,
} from '@/api-sdk';

export const usePhoneBind = () => {
  const sendSmsCode = useMutation({
    mutationFn: async (params: { phone: string }) => {
      const result = await authControllerSendSmsCode({
        throwOnError: true,
        body: { phone: params.phone, scene: 'bind' },
      });
      return result.data as { success?: boolean; message?: string };
    },
  });

  const sendUnbindPhoneCode = useMutation({
    mutationFn: async () => {
      const result = await authControllerSendUnbindPhoneCode({
        throwOnError: true,
      });
      return result.data as { success?: boolean; message?: string };
    },
  });

  const verifyUnbindPhone = useMutation({
    mutationFn: async (params: { code: string }) => {
      const result = await authControllerVerifyUnbindPhoneCode({
        throwOnError: true,
        body: { code: params.code } satisfies VerifyUnbindCodeDto,
      });
      return result.data as {
        success?: boolean;
        message?: string;
        token?: string;
      };
    },
  });

  const bindPhone = useMutation({
    mutationFn: async (params: { phone: string; code: string }) => {
      const result = await authControllerBindPhone({
        throwOnError: true,
        body: { phone: params.phone, code: params.code } satisfies BindPhoneDto,
      });
      return result.data as { success?: boolean; message?: string };
    },
  });

  const rebindPhone = useMutation({
    mutationFn: async (params: {
      phone: string;
      code: string;
      token: string;
    }) => {
      const result = await authControllerRebindPhone({
        throwOnError: true,
        body: {
          phone: params.phone,
          code: params.code,
          token: params.token,
        } satisfies RebindPhoneDto,
      });
      return result.data as { success?: boolean; message?: string };
    },
  });

  const unbindPhone = useMutation({
    // 解绑手机号需验证原手机号验证码（后端 unbind-phone 必填 code）
    mutationFn: async (params: { code: string }) => {
      const result = await authControllerUnbindPhone({
        throwOnError: true,
        body: { code: params.code } satisfies VerifyUnbindCodeDto,
      });
      return result.data as { success?: boolean; message?: string };
    },
  });

  return {
    sendSmsCode: sendSmsCode.mutateAsync,
    sendUnbindPhoneCode: sendUnbindPhoneCode.mutateAsync,
    verifyUnbindPhone: verifyUnbindPhone.mutateAsync,
    bindPhone: bindPhone.mutateAsync,
    rebindPhone: rebindPhone.mutateAsync,
    unbindPhone: unbindPhone.mutateAsync,
    loading:
      sendSmsCode.isPending ||
      sendUnbindPhoneCode.isPending ||
      verifyUnbindPhone.isPending ||
      bindPhone.isPending ||
      rebindPhone.isPending ||
      unbindPhone.isPending,
  };
};
