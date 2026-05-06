import { z } from 'zod/v4';

export const forgotPasswordSchema = z
  .object({
    contactType: z.enum(['email', 'phone']),
    email: z.string(),
    phone: z.string(),
  })
  .refine(
    (val) => {
      if (val.contactType === 'email') {
        return val.email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email);
      }
      return val.phone.length > 0 && /^1[3-9]\d{9}$/.test(val.phone);
    },
    { message: '请输入有效的联系方式' }
  );

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
