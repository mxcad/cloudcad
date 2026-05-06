import { z } from 'zod';

/**
 * Step 1 schema — basic info (username, optional nickname, conditional email).
 * Email validation is conditionally required based on runtime config.
 */
export const step1Schema = z.object({
  username: z
    .string()
    .min(1, '请输入用户名')
    .min(3, '用户名至少3个字符')
    .max(20, '用户名最多20个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  nickname: z.string().max(50, '昵称最多50个字符').optional().or(z.literal('')),
  email: z.string().optional().or(z.literal('')),
});

/**
 * Step 2 schema — password + confirm.
 */
export const step2Schema = z
  .object({
    password: z
      .string()
      .min(1, '密码不能为空')
      .min(8, '密码至少8个字符')
      .max(50, '密码最多50个字符'),
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

/**
 * Full form schema — used for final submission validation.
 */
export const registerFormSchema = z
  .object({
    username: step1Schema.shape.username,
    nickname: step1Schema.shape.nickname,
    email: step1Schema.shape.email,
    password: step2Schema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

/** Infer the form values type from the full schema. */
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
