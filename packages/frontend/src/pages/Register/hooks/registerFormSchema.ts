import { t } from '@/languages';
import { z } from 'zod';
import { validatePasswordPolicy } from '@cloudcad/platform';
import {
  passwordComplexityMessage,
  passwordTooShortMessage,
  type PasswordPolicyParams,
} from '@/lib/passwordPolicy';

/**
 * Step 1 schema — basic info (username, optional nickname, conditional email).
 * Email validation is conditionally required based on runtime config.
 */
export const step1Schema = z.object({
  username: z
    .string()
    .min(1, t('请输入用户名'))
    .min(3, t('用户名至少3个字符'))
    .max(20, t('用户名最多20个字符'))
    .regex(/^[a-zA-Z0-9_]+$/, t('用户名只能包含字母、数字和下划线')),
  nickname: z
    .string()
    .max(50, t('昵称最多50个字符'))
    .optional()
    .or(z.literal('')),
  email: z.string().optional().or(z.literal('')),
  agreedToTerms: z
    .boolean()
    .refine((v) => v === true, t('请先阅读并同意《用户协议》和《隐私政策》')),
});

/**
 * Step 2 schema — password + confirm.
 *
 * 工厂：口令策略（最小长度 / 类别构成）是按部署可配置的运行时事实，
 * schema 必须由生效值（usePasswordPolicy）构建，禁止写死策略数字
 * （门禁：pnpm scan:password-policy）。
 */
export function makeStep2Schema(policy: PasswordPolicyParams) {
  return z
    .object({
      password: z
        .string()
        .min(1, t('密码不能为空'))
        // 长度下限与后端 assertPasswordPolicy 对齐（生效值经 /runtime-config/public 下发）
        .min(policy.minLength, passwordTooShortMessage(policy.minLength))
        .max(50, t('密码最多50个字符'))
        .refine(
          (v) => validatePasswordPolicy(v, policy).reason !== 'complexity',
          {
            message: passwordComplexityMessage(policy.minCategories),
            path: ['password'],
          }
        ),
      confirmPassword: z.string().min(1, t('请再次输入新密码')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('两次输入的新密码不一致'),
      path: ['confirmPassword'],
    });
}

/**
 * Full form schema — used for final submission validation.
 */
export function makeRegisterFormSchema(policy: PasswordPolicyParams) {
  return z
    .object({
      username: step1Schema.shape.username,
      nickname: step1Schema.shape.nickname,
      email: step1Schema.shape.email,
      password: makeStep2Schema(policy).shape.password,
      // 与 makeStep2Schema 对齐：留空的确认密码要说「请再次输入」，
      // 而不是被下方的不一致 refine 抢先报「两次输入的密码不一致」
      confirmPassword: makeStep2Schema(policy).shape.confirmPassword,
      agreedToTerms: step1Schema.shape.agreedToTerms,
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('两次输入的新密码不一致'),
      path: ['confirmPassword'],
    });
}

/** Infer the form values type from the full schema. */
export type RegisterFormValues = z.infer<
  ReturnType<typeof makeRegisterFormSchema>
>;
