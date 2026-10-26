import { t } from '@/languages';
import { z } from 'zod/v4';

export const forgotPasswordSchema = z
  .object({
    contactType: z.enum(['email', 'phone']),
    email: z.string(),
    phone: z.string(),
  })
  .superRefine((val, ctx) => {
    // 必须用 superRefine + 显式 path：顶层 .refine() 的错误会被 zodResolver 放进
    // key ""，RHF 不映射进 formState.errors（实测 errorKeys 为空）——提交被拦下
    // 但错误消息永不可达，用户点了没反应（纯静默失败）。带 path 才能落到具体字段。
    if (val.contactType === 'email') {
      if (!val.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email)) {
        ctx.addIssue({
          code: 'custom',
          path: ['email'],
          message: t('请输入有效的联系方式'),
        });
      }
    } else if (!val.phone || !/^1[3-9]\d{9}$/.test(val.phone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: t('请输入有效的联系方式'),
      });
    }
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
