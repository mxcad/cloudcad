import { t } from '@/languages';
import { z } from 'zod/v4';
import { validatePasswordPolicy } from '@cloudcad/platform';
import {
  passwordComplexityMessage,
  passwordTooShortMessage,
  type PasswordPolicyParams,
} from '@/lib/passwordPolicy';

/**
 * 工厂：口令策略（最小长度 / 类别构成）是按部署可配置的运行时事实，
 * schema 必须由生效值（usePasswordPolicy）构建，禁止写死策略数字
 * （门禁：pnpm scan:password-policy）。
 */
export function makeResetPasswordSchema(policy: PasswordPolicyParams) {
  return z
    .object({
      code: z.string().min(1, t('请输入验证码')),
      // 长度下限与后端 assertPasswordPolicy 对齐（生效值经 /runtime-config/public 下发）
      newPassword: z
        .string()
        .min(policy.minLength, passwordTooShortMessage(policy.minLength))
        // 上限与后端 DTO @MaxLength(50) 对齐
        .max(50, t('密码最多50个字符'))
        .refine(
          (v) => validatePasswordPolicy(v, policy).reason !== 'complexity',
          {
            message: passwordComplexityMessage(policy.minCategories),
            path: ['newPassword'],
          }
        ),
      confirmPassword: z.string().min(1, t('请确认新密码')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('两次输入的新密码不一致'),
      path: ['confirmPassword'],
    });
}

export type ResetPasswordValues = z.infer<
  ReturnType<typeof makeResetPasswordSchema>
>;
