/**
 * 修改 / 设置密码（D-06/D-07/D-08/D-15）。
 *
 * POST /users/change-password；hasPassword === false 时是「设置」而非「修改」
 * （手机/微信注册用户尚未设密码，此时不传 oldPassword）。
 *
 * 改密成功后旧凭证可能已失效：用新密码重新登录换取新 token，保持会话不中断
 * （D-08）；重登失败则清凭证回 guest 态，由登录引导接着提示用新密码登录。
 */
import type { Ref } from 'vue';
import { computed, ref } from 'vue';
import {
  authControllerLogin,
  usersControllerChangePassword,
} from '@cloudcad/api-sdk/sdk.gen';
import { showDialog, showSuccessToast } from 'vant';
import { scorePasswordStrength } from '@cloudcad/platform';
import { t } from '@/languages';
import { applyAuthResponse, clearSession } from '@/utils/authSession';
import { unwrap, errMsg } from '@/utils/apiError';
import type { UserProfile } from './useProfileData';

export function useProfilePassword(
  profile: Ref<UserProfile>,
  refresh: () => Promise<unknown>
) {
  const showPwdDialog = ref(false);
  const oldPassword = ref('');
  const newPassword = ref('');
  const confirmPassword = ref('');
  const pwdErr = ref('');
  const submittingPwd = ref(false);

  // 密码可见性切换（D-15）：Vant van-field 无内置眼睛切换，用 right-icon 手动实现
  const showOldPwd = ref(false);
  const showNewPwd = ref(false);
  const showConfirmPwd = ref(false);
  const oldPwdType = computed(() => (showOldPwd.value ? 'text' : 'password'));
  const newPwdType = computed(() => (showNewPwd.value ? 'text' : 'password'));
  const confirmPwdType = computed(() =>
    showConfirmPwd.value ? 'text' : 'password'
  );
  function toggleVisible(target: 'old' | 'new' | 'confirm') {
    if (target === 'old') showOldPwd.value = !showOldPwd.value;
    if (target === 'new') showNewPwd.value = !showNewPwd.value;
    if (target === 'confirm') showConfirmPwd.value = !showConfirmPwd.value;
  }

  // hasPassword === false：手机/微信注册用户尚未设置密码，此页是「设置」而非「修改」
  const isSettingPassword = computed(() => profile.value.hasPassword === false);

  const pwdTitle = computed(() =>
    isSettingPassword.value ? t('设置密码') : t('修改密码')
  );
  const pwdConfirmLabel = computed(() =>
    submittingPwd.value
      ? t('提交中…')
      : isSettingPassword.value
        ? t('设置密码')
        : t('确认修改')
  );
  const newPwdPlaceholder = computed(() =>
    isSettingPassword.value
      ? t('至少8位，包含大小写字母和数字')
      : t('请输入新密码（至少 6 位）')
  );

  // 强度打分（D-06）：评分收敛到 @cloudcad/platform 的 scorePasswordStrength
  // （与 PC 共用，此前本文件手写一份 4 条判定并靠注释维持同步）；这里只映射本端标签与颜色。
  const pwdStrength = computed(() => {
    const pwd = newPassword.value;
    if (!pwd) return { score: 0, label: '', color: '' };
    const score = scorePasswordStrength(pwd);
    const levels = [
      { label: t('太弱'), color: '#ef4444' },
      { label: t('较弱'), color: '#f97316' },
      { label: t('一般'), color: '#eab308' },
      { label: t('较强'), color: '#22c55e' },
      { label: t('很强'), color: '#10b981' },
    ];
    const level = levels[score] ?? levels[0]!;
    return { score, label: level.label, color: level.color };
  });

  const pwdStrengthWidth = computed(
    () => `${(pwdStrength.value.score / 4) * 100}%`
  );

  // 建议清单里已完成项打勾（D-06）：让用户看到差什么，而不是只看到颜色
  const pwdSuggestions = computed(() => [
    { text: t('密码长度至少 8 个字符'), ok: newPassword.value.length >= 8 },
    {
      text: t('包含大小写字母和数字'),
      ok:
        /[a-z]/.test(newPassword.value) &&
        /[A-Z]/.test(newPassword.value) &&
        /\d/.test(newPassword.value),
    },
    { text: t('包含特殊字符'), ok: /[^a-zA-Z0-9]/.test(newPassword.value) },
    { text: t('不要在多个网站使用相同的密码'), ok: false },
  ]);

  const canSubmitPwd = computed(
    () =>
      newPassword.value.length >= 6 &&
      newPassword.value === confirmPassword.value &&
      (!isSettingPassword.value ? oldPassword.value.length > 0 : true)
  );

  function openPwdDialog() {
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    pwdErr.value = '';
    showOldPwd.value = false;
    showNewPwd.value = false;
    showConfirmPwd.value = false;
    showPwdDialog.value = true;
  }

  /** 改密后用新密码重新登录，保持会话不中断（D-08） */
  async function reloginWithNewPassword(): Promise<boolean> {
    const account = profile.value.username ?? profile.value.email ?? '';
    if (!account) return false;
    try {
      const res = await authControllerLogin({
        body: { account, password: newPassword.value },
      });
      const data = unwrap<Record<string, unknown>>(res);
      const accessToken = data.accessToken ?? data.access_token;
      if (!accessToken) return false;
      // 走会话唯一写入出口：token/user 落盘 + useAuthState/useUser 状态机同步
      // （旧实现手写 setItem 绕开出口，useUser 的 user ref 不刷新）
      applyAuthResponse({
        accessToken: String(accessToken),
        refreshToken:
          (data.refreshToken ?? data.refresh_token)
            ? String(data.refreshToken ?? data.refresh_token)
            : undefined,
        user: data.user,
      });
      return true;
    } catch (e) {
      console.error('[Profile] relogin after password change:', e);
      return false;
    }
  }

  async function onChangePassword() {
    if (!canSubmitPwd.value || submittingPwd.value) return;
    submittingPwd.value = true;
    pwdErr.value = '';
    try {
      unwrap(
        await usersControllerChangePassword({
          body: {
            oldPassword: isSettingPassword.value
              ? undefined
              : oldPassword.value,
            newPassword: newPassword.value,
          },
        })
      );
      showPwdDialog.value = false;

      // 改密后旧凭证可能已失效：用新密码重新登录换取新 token
      const relogged = await reloginWithNewPassword();
      if (relogged) {
        showSuccessToast(
          isSettingPassword.value ? t('密码已设置成功') : t('密码已修改成功')
        );
        await refresh();
        return;
      }

      // 重登失败：先告知，再走唯一清理出口回 guest 态（同步 useAuthState/useUser）——
      // 登录引导弹窗会接着提示用新密码登录
      await showDialog({
        title: t('需要重新登录'),
        message: t('密码已修改成功，请使用新密码登录。'),
      });
      clearSession();
    } catch (e) {
      pwdErr.value = errMsg(e, t('修改失败'));
    } finally {
      submittingPwd.value = false;
    }
  }

  return {
    showPwdDialog,
    oldPassword,
    newPassword,
    confirmPassword,
    pwdErr,
    submittingPwd,
    showOldPwd,
    showNewPwd,
    showConfirmPwd,
    oldPwdType,
    newPwdType,
    confirmPwdType,
    toggleVisible,
    isSettingPassword,
    pwdTitle,
    pwdConfirmLabel,
    newPwdPlaceholder,
    pwdStrength,
    pwdStrengthWidth,
    pwdSuggestions,
    canSubmitPwd,
    openPwdDialog,
    onChangePassword,
  };
}
