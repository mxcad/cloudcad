import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePasswordChange } from './usePasswordChange';
import { usersControllerUploadAvatar } from '@/api-sdk';
import { t } from '@/languages';
import {
  passwordComplexityMessage,
  passwordTooShortMessage,
  usePasswordPolicy,
} from '@/lib/passwordPolicy';
import { validatePasswordPolicy } from '@cloudcad/platform';

interface UsePasswordProfileOptions {
  error: string | null;
  success: string | null;
  setError: (e: string | null) => void;
  setSuccess: (e: string | null) => void;
  setLoading: (v: boolean) => void;
}

export function usePasswordProfile({
  error,
  success,
  setError,
  setSuccess,
  setLoading,
}: UsePasswordProfileOptions) {
  const navigate = useNavigate();
  const { user, logout, login, refreshUser } = useAuth();
  const { changePassword } = usePasswordChange();
  // 预检用生效策略值（/runtime-config/public 下发），与后端 assertPasswordPolicy 对齐
  const policy = usePasswordPolicy();

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    totpCode: '',
  });

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // #415 TOTP step-up：profile 响应（authControllerGetProfile → UserProfileResponseDto）
  // 由服务端算好的「当前用户改密是否需要动态码」。auth context 把 user 类型标为 UserDto，
  // 运行时实为 UserProfileResponseDto，故断言取该字段（缺省 false）。
  const passwordChangeRequiresMfa =
    (user as unknown as { passwordChangeRequiresMfa?: boolean } | null)
      ?.passwordChangeRequiresMfa ?? false;

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setPasswordForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success, setError, setSuccess]
  );

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(t('两次输入的新密码不一致'));
      setLoading(false);
      return;
    }
    // 预检与后端 assertPasswordPolicy 对齐（生效值经 /runtime-config/public 下发），弱口令黑名单由后端兜底
    const check = validatePasswordPolicy(passwordForm.newPassword, policy);
    if (!check.valid) {
      setError(
        check.reason === 'too_short'
          ? passwordTooShortMessage(policy.minLength)
          : passwordComplexityMessage(policy.minCategories)
      );
      setLoading(false);
      return;
    }
    if (user?.hasPassword !== false && !passwordForm.oldPassword) {
      setError(t('请输入当前密码'));
      setLoading(false);
      return;
    }
    // #415 TOTP step-up：需动态码时缺码则拦截（后端同样校验，前端预检提升体验）
    if (passwordChangeRequiresMfa && !passwordForm.totpCode) {
      setError(t('请输入 6 位动态码'));
      setLoading(false);
      return;
    }
    try {
      await changePassword({
        oldPassword:
          user?.hasPassword === false ? undefined : passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
        totpCode: passwordChangeRequiresMfa
          ? passwordForm.totpCode
          : undefined,
      });

      if (user?.username) {
        try {
          await login(user.username, passwordForm.newPassword);
          setSuccess(
            `${
              user?.hasPassword === false
                ? t('密码已设置成功')
                : t('密码已修改成功')
            }`
          );
        } catch (loginErr) {
          console.error('Auto login error:', loginErr);
          try {
            await logout();
          } catch (logoutErr) {
            console.error('Logout error:', logoutErr);
          }
          // 完整键而非碎片拼接：碎片在 en-US 译成病句（"Password has been Setting Success..."）
          navigate('/login', {
            state: {
              message:
                user?.hasPassword === false
                  ? t('密码已设置成功')
                  : t('密码已修改成功'),
            },
          });
        }
      } else {
        try {
          await logout();
        } catch (logoutErr) {
          console.error('Logout error:', logoutErr);
        }
        navigate('/login', {
          state: {
            message:
              user?.hasPassword === false
                ? t('密码已设置成功')
                : t('密码已修改成功'),
          },
        });
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('密码修改失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(t('仅支持 PNG、JPEG、GIF、WebP 格式的图片'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('头像文件大小不能超过 5MB'));
      return;
    }

    setAvatarUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await usersControllerUploadAvatar({
        throwOnError: true,
        body: { file } as never,
      });
      setSuccess(t('头像更新成功'));
      await refreshUser();
    } catch (err) {
      setError((err as Error).message || t('头像上传失败'));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return {
    user,
    passwordForm,
    setPasswordForm,
    passwordChangeRequiresMfa,
    avatarUploading,
    fileInputRef,
    handlePasswordChange,
    handlePasswordSubmit,
    handleAvatarChange,
  };
}
