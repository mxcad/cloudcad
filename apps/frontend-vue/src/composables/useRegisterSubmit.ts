import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { validateRegisterForm } from '@/utils/validation';
import { authApi } from '@/services/authApi';

export function useRegisterSubmit(options: {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
}) {
  const router = useRouter();
  const { register: registerUser } = useAuth();

  const loading = ref(false);

  async function handleSubmit(params: {
    formData: { email: string; username: string; nickname: string; password: string };
    phoneForm: { phone: string; code: string };
    confirmPassword: string;
    isWechatRegister: boolean;
    wechatTempToken?: string;
    fieldErrors: Record<string, string>;
  }): Promise<void> {
    const { formData, phoneForm, confirmPassword, isWechatRegister, wechatTempToken, fieldErrors } = params;

    const validationError = validateRegisterForm(
      {
        email: formData.email ?? '',
        username: formData.username,
        password: formData.password,
        confirmPassword,
        nickname: formData.nickname,
      },
      { validateEmail: options.mailEnabled && options.requireEmailVerification },
    );

    if (validationError) {
      throw new Error(validationError);
    }

    const relevantFields = ['username', 'password', 'confirmPassword', 'nickname'];
    if (options.mailEnabled && options.requireEmailVerification) {
      relevantFields.push('email');
    }
    if (options.smsEnabled && options.requirePhoneVerification) {
      relevantFields.push('phone');
      if (options.requirePhoneVerification) relevantFields.push('code');
    }

    const actualErrors = Object.entries(fieldErrors).filter(
      ([key, v]) => v && v.trim() && relevantFields.includes(key),
    );

    if (actualErrors.length > 0) {
      const labels: Record<string, string> = {
        username: '用户名',
        password: '密码',
        confirmPassword: '确认密码',
        nickname: '昵称',
        email: '邮箱',
        phone: '手机号',
        code: '验证码',
      };
      const errorFields = actualErrors.map(([key]) => labels[key] || key);
      throw new Error(`请修正以下字段：${errorFields.join('、')}`);
    }

    if (phoneForm.phone && phoneForm.code && options.smsEnabled && options.requirePhoneVerification) {
      if (options.mailEnabled && options.requireEmailVerification) {
        router.push({
          path: '/verify-email',
          query: {
            email: formData.email,
            phone: phoneForm.phone,
            code: phoneForm.code,
            username: formData.username,
            password: formData.password,
            nickname: formData.nickname,
            message: '请先验证邮箱，完成注册',
          },
        });
        return;
      }

      await authApi.registerByPhone({
        username: formData.username,
        password: formData.password,
        nickname: formData.nickname,
        phone: phoneForm.phone,
        code: phoneForm.code,
      });

      if (isWechatRegister) {
        sessionStorage.removeItem('wechatTempToken');
      }
      router.push('/');
    } else {
      const needEmail = options.mailEnabled && options.requireEmailVerification;
      const registerData = needEmail
        ? { ...formData, wechatTempToken }
        : { ...formData, email: undefined, wechatTempToken };

      const result = await registerUser(registerData as Parameters<typeof registerUser>[0]);

      if (isWechatRegister) {
        sessionStorage.removeItem('wechatTempToken');
      }

      if (result.email) {
        router.push({
          path: '/verify-email',
          query: { email: result.email, message: result.message },
        });
      } else {
        router.push('/');
      }
    }
  }

  return {
    loading,
    handleSubmit,
  };
}