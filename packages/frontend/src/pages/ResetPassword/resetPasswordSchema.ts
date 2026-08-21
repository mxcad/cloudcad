import { t } from '@/languages';
import { z } from 'zod/v4';

export const resetPasswordSchema = z
  .object({
    code: z.string().min(1, t('请输入验证码')),
    newPassword: z.string().min(8, t('密码至少需要8个字符')),
    confirmPassword: z.string().min(1, t('请确认新密码')),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: t('两次输入的密码不一致'),
    path: ['confirmPassword'],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
