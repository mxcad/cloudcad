import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePasswordChange } from './usePasswordChange';
import { usersControllerUploadAvatar } from '@/api-sdk';
import { t } from '@/languages';

export interface PasswordStrengthResult {
  strength: number;
  label: string;
  color: string;
}

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

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getPasswordStrength = (password: string): PasswordStrengthResult => {
    if (!password) return { strength: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const levels = [
      { label: t('太弱'), color: '#ef4444' },
      { label: t('较弱'), color: '#f97316' },
      { label: t('一般'), color: '#eab308' },
      { label: t('较强'), color: '#22c55e' },
      { label: t('很强'), color: '#10b981' },
    ];
    return {
      strength: score,
      label: levels[score]?.label || levels[0]!.label,
      color: levels[score]?.color || levels[0]!.color,
    };
  };

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
    if (passwordForm.newPassword.length < 6) {
      setError(t('新密码至少需要6个字符'));
      setLoading(false);
      return;
    }
    if (user?.hasPassword !== false && !passwordForm.oldPassword) {
      setError(t('请输入当前密码'));
      setLoading(false);
      return;
    }
    try {
      await changePassword({
        oldPassword:
          user?.hasPassword === false ? undefined : passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
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
          navigate('/login', {
            state: {
              message: `${t('密码已')}${
                user?.hasPassword === false ? t('设置') : t('修改')
              }${t('成功，请使用新密码登录')}`,
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
            message: t(
              `密码已${user?.hasPassword === false ? '设置' : '修改'}成功，请使用新密码登录`
            ),
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
        body: { file } as never,
      });
      if (result.error) throw result.error;
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
    avatarUploading,
    fileInputRef,
    passwordStrength: getPasswordStrength(passwordForm.newPassword),
    handlePasswordChange,
    handlePasswordSubmit,
    handleAvatarChange,
  };
}
