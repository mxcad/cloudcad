/**
 * 账号注销（对齐 PC useDeactivateProfile / ProfileDeactivateTab）：
 *   - 验证方式按用户数据动态生成（未绑定/未验证的选项不出现），
 *     默认选中优先级 密码 > 手机(已验证) > 邮箱 > 微信（同 PC）
 *   - 冷静期天数 = 运行时配置 userCancelGraceDays（默认 7）
 *   - 成功 → 展示冷静期说明 → 1.5s 后 onDeactivated（页面执行登出）
 *
 * 微信验证：整页跳转授权后 Profile 页解析 #wechat_result，经 setWechatCode 写回；
 * 授权完成 ≠ 验证通过，openid 校验在提交注销时由后端执行（同 PC 注释口径）。
 */
import { computed, ref } from 'vue';
import {
  authControllerResendVerification,
  authControllerSendSmsCode,
  usersControllerDeactivateAccount,
} from '@cloudcad/api-sdk/sdk.gen';
import { t } from '@/languages';
import { toError, errMsg } from '@/utils/apiError';
import { isCode } from '@/utils/authValidation';
import { useCountdown } from '@/composables/useCountdown';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import type { UserProfile } from '@/composables/useProfileData';

export type DeactivateMethod = 'password' | 'phone' | 'email' | 'wechat';

export function useProfileDeactivate(
  profile: { value: UserProfile },
  onDeactivated: () => void
) {
  const { config } = useRuntimeConfig();
  const graceDays = computed(() => config.value.userCancelGraceDays || 7);

  const showSheet = ref(false);
  const successMsg = ref('');
  const error = ref('');
  const submitting = ref(false);
  const confirmed = ref(false);

  const method = ref<DeactivateMethod>('password');
  const password = ref('');
  const phoneCode = ref('');
  const emailCode = ref('');
  const wechatCode = ref('');

  // 手机/邮箱验证码倒计时各自独立，切换验证方式互不串扰（同 PC）
  const {
    countdown: phoneCountdown,
    start: startPhoneCountdown,
    isReady: phoneReady,
  } = useCountdown();
  const {
    countdown: emailCountdown,
    start: startEmailCountdown,
    isReady: emailReady,
  } = useCountdown();

  /** 选项按用户数据动态生成（同 PC：条件不满足的选项不出现而非禁用） */
  const methodOptions = computed(() => {
    const p = profile.value;
    const options: { value: DeactivateMethod; label: string }[] = [];
    if (p.hasPassword)
      options.push({ value: 'password', label: t('密码验证') });
    if (p.phone && p.phoneVerified === true)
      options.push({ value: 'phone', label: t('手机验证码') });
    if (p.email) options.push({ value: 'email', label: t('邮箱验证码') });
    if (p.wechatId) options.push({ value: 'wechat', label: t('微信验证') });
    return options;
  });

  /** 打开弹窗；presetMethod 用于微信授权回跳后直接落到微信验证 */
  function open(presetMethod?: DeactivateMethod) {
    const presetValid =
      presetMethod && methodOptions.value.some((o) => o.value === presetMethod);
    method.value = presetValid
      ? presetMethod
      : (methodOptions.value[0]?.value ?? 'password');
    password.value = '';
    phoneCode.value = '';
    emailCode.value = '';
    wechatCode.value = '';
    confirmed.value = false;
    error.value = '';
    successMsg.value = '';
    showSheet.value = true;
  }

  function close() {
    showSheet.value = false;
  }

  /** 微信授权回跳后写回 code 并切到微信验证（授权完成 ≠ 验证通过） */
  function setWechatCode(code: string) {
    wechatCode.value = code;
    method.value = 'wechat';
  }

  const canSubmit = computed(() => {
    switch (method.value) {
      case 'password':
        return !!password.value;
      case 'phone':
        return isCode(phoneCode.value);
      case 'email':
        return isCode(emailCode.value);
      case 'wechat':
        return !!wechatCode.value;
      default:
        return false;
    }
  });

  async function sendPhoneCode() {
    if (!phoneReady() || submitting.value) return;
    const phoneNum = profile.value.phone;
    if (!phoneNum) {
      error.value = t('手机号不存在');
      return;
    }
    error.value = '';
    try {
      const res = await authControllerSendSmsCode({
        body: { phone: phoneNum, scene: 'bind' },
      });
      if (res.error) throw toError(res.error);
      startPhoneCountdown();
    } catch (e) {
      error.value = errMsg(toError(e), t('发送验证码失败'));
    }
  }

  async function sendEmailCode() {
    if (!emailReady() || submitting.value) return;
    const emailAddr = profile.value.email;
    if (!emailAddr) {
      error.value = t('邮箱不存在');
      return;
    }
    error.value = '';
    try {
      const res = await authControllerResendVerification({
        body: { email: emailAddr },
      });
      if (res.error) throw toError(res.error);
      startEmailCountdown();
    } catch (e) {
      error.value = errMsg(toError(e), t('发送验证码失败'));
    }
  }

  async function submit() {
    if (!confirmed.value || !canSubmit.value || submitting.value) return;
    submitting.value = true;
    error.value = '';
    try {
      const res = await usersControllerDeactivateAccount({
        body: {
          password: method.value === 'password' ? password.value : undefined,
          phoneCode:
            method.value === 'phone' ? phoneCode.value.trim() : undefined,
          emailCode:
            method.value === 'email' ? emailCode.value.trim() : undefined,
          wechatCode: method.value === 'wechat' ? wechatCode.value : undefined,
        },
      });
      if (res.error) throw toError(res.error);
      successMsg.value = t(
        '账户已注销。{days} 天内重新登录可自动取消注销，逾期需联系客服恢复；30 天后数据将被彻底删除。',
        { days: String(graceDays.value) }
      );
      // 同 PC：成功提示 1.5s 后自动登出
      setTimeout(onDeactivated, 1500);
    } catch (e) {
      error.value = errMsg(toError(e), t('注销失败'));
    } finally {
      submitting.value = false;
    }
  }

  return {
    graceDays,
    showSheet,
    successMsg,
    error,
    submitting,
    confirmed,
    method,
    password,
    phoneCode,
    emailCode,
    wechatCode,
    phoneCountdown,
    emailCountdown,
    methodOptions,
    canSubmit,
    open,
    close,
    setWechatCode,
    sendPhoneCode,
    sendEmailCode,
    submit,
  };
}
