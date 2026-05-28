///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';
import { z } from 'zod/v4';

const phoneRegex = /^1[3-9]\d{9}$/;

export const accountLoginSchema = z.object({
  account: z
    .string()
    .min(1, t('请输入账号')),
  password: z
    .string()
    .min(1, t('请输入密码')),
});

export const phoneLoginSchema = z.object({
  phone: z
    .string()
    .min(1, t('请输入手机号'))
    .regex(phoneRegex, t('请输入正确的手机号')),
  code: z
    .string()
    .min(1, t('请输入验证码'))
    .regex(/^\d{6}$/, t('请输入6位数字验证码')),
});

export type AccountLoginValues = z.infer<typeof accountLoginSchema>;
export type PhoneLoginValues = z.infer<typeof phoneLoginSchema>;
