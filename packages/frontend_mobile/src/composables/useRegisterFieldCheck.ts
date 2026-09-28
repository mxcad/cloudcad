/**
 * 注册字段唯一性预检（对齐 PC useRegisterForm / usePhoneVerification 同语义）：
 *   - 提交注册前预检用户名 + 邮箱（至少填一个才发请求）：被占用则阻断提交、行内报错
 *   - 发送短信验证码前预检手机号：被占用则不发码
 *   - 预检 API 失败：用户名/邮箱不阻断（兜底最终提交时后端 409，同 PC）；
 *     手机号场景视为发码失败（同 PC）
 *
 * SDK 的 check-field 响应为 `200: unknown`（未生成类型），后端实际返回
 * { usernameExists, emailExists, phoneExists }（见 backend auth.controller.ts check-field）。
 */
import { ref, watch, type Ref } from 'vue';
import { authControllerCheckFieldUniqueness } from '@cloudcad/api-sdk/sdk.gen';

interface CheckFieldResult {
  usernameExists?: boolean;
  emailExists?: boolean;
  phoneExists?: boolean;
}

async function checkField(body: {
  username?: string;
  email?: string;
  phone?: string;
}): Promise<CheckFieldResult> {
  const res = await authControllerCheckFieldUniqueness({ body });
  // SDK 默认不抛错：失败时错误在 result.error
  if (res.error) throw res.error;
  return (res.data ?? {}) as CheckFieldResult;
}

export function useRegisterFieldCheck(fields: {
  username: Ref<string>;
  email: Ref<string>;
  phone: Ref<string>;
}) {
  const usernameTaken = ref(false);
  const emailTaken = ref(false);
  const phoneTaken = ref(false);
  const checking = ref(false);

  // 字段值变化即清对应错误，避免过期的「已被占用」持续阻断用户
  watch(fields.username, () => {
    usernameTaken.value = false;
  });
  watch(fields.email, () => {
    emailTaken.value = false;
  });
  watch(fields.phone, () => {
    phoneTaken.value = false;
  });

  /** 提交注册前的预检：用户名 + 邮箱。返回 true 表示可继续提交 */
  async function checkBeforeSubmit(): Promise<boolean> {
    const name = fields.username.value.trim();
    const mail = fields.email.value.trim();
    if (!name && !mail) return true;
    checking.value = true;
    try {
      const result = await checkField({
        username: name || undefined,
        email: mail || undefined,
      });
      usernameTaken.value = result.usernameExists === true;
      emailTaken.value = result.emailExists === true;
      return !usernameTaken.value && !emailTaken.value;
    } catch (e) {
      // 预检失败不阻断：兜底靠最终提交时后端 409（同 PC）
      console.error('检查字段唯一性失败:', e);
      return true;
    } finally {
      checking.value = false;
    }
  }

  /** 发送短信验证码前的手机号预检：'ok' 可发码 / 'taken' 行内报错不发码 / 'error' 预检 API 失败 */
  async function checkPhoneBeforeSendCode(): Promise<'ok' | 'taken' | 'error'> {
    const phoneNum = fields.phone.value.trim();
    if (!phoneNum) return 'ok';
    checking.value = true;
    try {
      const result = await checkField({ phone: phoneNum });
      phoneTaken.value = result.phoneExists === true;
      return phoneTaken.value ? 'taken' : 'ok';
    } catch (e) {
      console.error('检查字段唯一性失败:', e);
      return 'error';
    } finally {
      checking.value = false;
    }
  }

  return {
    usernameTaken,
    emailTaken,
    phoneTaken,
    checking,
    checkBeforeSubmit,
    checkPhoneBeforeSendCode,
  };
}
