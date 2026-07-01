import { z } from 'zod';
import { t } from '@/languages';

export interface UserFormContext {
  mailEnabled: boolean;
  isEditing: boolean;
}

export function userFormSchema(ctx: UserFormContext) {
  const emailBase = ctx.mailEnabled
    ? z.string().min(1, t('邮箱不能为空'))
    : z.string();

  return z.object({
    username: z
      .string()
      .min(1, t('用户名不能为空'))
      .min(3, t('用户名至少3个字符'))
      .max(20, t('用户名最多20个字符')),
    email: emailBase.refine(
      (val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      t('邮箱格式不正确'),
    ),
    password: ctx.isEditing ? z.string() : z.string().min(1, t('密码不能为空')),
    roleId: z.string(),
    nickname: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  });
}

export type UserFormData = z.infer<ReturnType<typeof userFormSchema>>;
