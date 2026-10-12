import { t } from '@/languages';
import { z } from 'zod/v4';
import { validatePasswordPolicy } from '@cloudcad/platform';

export const resetPasswordSchema = z
  .object({
    code: z.string().min(1, t('请输入验证码')),
    // 长度下限与后端 assertPasswordPolicy 对齐（≥10）；复杂度（≥3 类）走下方 refine
    newPassword: z
      .string()
      .min(10, t('密码至少10个字符'))
      .refine((v) => validatePasswordPolicy(v).reason !== 'complexity', {
        message: t('密码需包含大小写字母、数字、特殊字符中至少三类'),
        path: ['newPassword'],
      }),
    confirmPassword: z.string().min(1, t('请确认新密码')),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: t('两次输入的密码不一致'),
    path: ['confirmPassword'],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
