import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePhoneBind } from './usePhoneBind';
import { useCountdown } from './useCountdown';
import { useNotification } from '@/contexts/NotificationContext';
import { t } from '@/languages';

export type PhoneStep = 'verifyOld' | 'inputNew' | 'verifyNew';

export interface PhoneFormState {
  phone: string;
  code: string;
}

interface UsePhoneProfileOptions {
  error: string | null;
  success: string | null;
  setError: (e: string | null) => void;
  setSuccess: (e: string | null) => void;
  setLoading: (v: boolean) => void;
}

export function usePhoneProfile({
  error,
  success,
  setError,
  setSuccess,
  setLoading,
}: UsePhoneProfileOptions) {
  const { refreshUser } = useAuth();
  const {
    sendSmsCode,
    sendUnbindPhoneCode,
    verifyUnbindPhone,
    bindPhone,
    rebindPhone,
    unbindPhone,
  } = usePhoneBind();
  const { showToast, showConfirm } = useNotification();

  const [phoneForm, setPhoneForm] = useState<PhoneFormState>({
    phone: '',
    code: '',
  });
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('verifyOld');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string>('');
  // 解绑模式：verifyOld 验证通过后直接解绑（而非进入换绑新手机号流程）
  const [unbindMode, setUnbindMode] = useState(false);
  // 倒计时/发送中状态仅在手机号绑定流程内持有，避免与其他验证流程（邮箱/注销）串扰
  const { countdown, setCountdown } = useCountdown();
  const [sendingCode, setSendingCode] = useState(false);

  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      if (name === 'phone' && value && !/^\d*$/.test(value)) return;
      if (name === 'code' && value && !/^\d*$/.test(value)) return;
      setPhoneForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success, setError, setSuccess]
  );

  const handleSendPhoneCode = async () => {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError(t('请输入正确的手机号'));
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await sendSmsCode({ phone: phoneForm.phone });
      if (response?.success) {
        setSuccess(t('验证码已发送'));
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        showToast(response?.message || t('发送验证码失败'), 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败'),
        'error'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleSendUnbindCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      const response = await sendUnbindPhoneCode();
      if (response?.success) {
        setSuccess(t('验证码已发送到原手机号'));
        setCountdown(60);
      } else {
        showToast(response?.message || t('发送验证码失败'), 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败'),
        'error'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyOldPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError(t('请输入 6 位数字验证码'));
      setLoading(false);
      return;
    }
    try {
      if (unbindMode) {
        // 解绑模式：unbind-phone 接口自行验证原手机号验证码并解绑。
        // 验证码一次性，不能先 verifyUnbindPhone 消费后再传同一 code
        await performUnbind(phoneForm.code);
        return;
      }
      const response = await verifyUnbindPhone({ code: phoneForm.code });
      if (response?.success) {
        setCountdown(0);
        setSuccess(t('原手机号验证通过'));
        setVerifyToken(response.token || '');
        setPhoneStep('inputNew');
        setPhoneForm({ phone: '', code: '' });
      } else {
        setError(response?.message || t('验证失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('验证失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendNewPhoneCode = async () => {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError(t('请输入正确的手机号'));
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await sendSmsCode({ phone: phoneForm.phone });
      if (response?.success) {
        setSuccess(t('验证码已发送'));
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        showToast(response?.message || t('发送验证码失败'), 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败'),
        'error'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleRebindPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError(t('请输入正确的手机号'));
      setLoading(false);
      return;
    }
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError(t('请输入 6 位数字验证码'));
      setLoading(false);
      return;
    }
    if (!verifyToken) {
      setError(t('请先验证原手机号'));
      setLoading(false);
      return;
    }
    try {
      const response = await rebindPhone({
        phone: phoneForm.phone,
        code: phoneForm.code,
        token: verifyToken,
      });
      if (response?.success) {
        setSuccess(t('手机号换绑成功'));
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setVerifyToken('');
        setCountdown(0);
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response?.message || t('换绑失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('换绑失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBindPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError(t('请输入正确的手机号'));
      setLoading(false);
      return;
    }
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError(t('请输入6位数字验证码'));
      setLoading(false);
      return;
    }
    try {
      const response = await bindPhone({
        phone: phoneForm.phone,
        code: phoneForm.code,
      });
      if (response?.success) {
        setSuccess(t('手机号绑定成功'));
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setCountdown(0);
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response?.message || t('绑定失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('绑定失败')
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * 执行解绑（必须携带已通过验证的原手机号验证码）
   */
  const performUnbind = async (code: string) => {
    const response = await unbindPhone({ code });
    if (response?.success) {
      showToast(t('手机号解绑成功'), 'success');
      setSuccess(t('手机号解绑成功'));
      setCountdown(0);
      setPhoneForm({ phone: '', code: '' });
      setVerifyToken('');
      setIsEditingPhone(false);
      setUnbindMode(false);
      await refreshUser();
    } else {
      setError(response?.message || t('解绑失败'));
      showToast(response?.message || t('解绑失败'), 'error');
    }
  };

  /**
   * 开始解绑：确认后进入原手机号验证码流程（验证通过后直接解绑）
   */
  const handleStartUnbind = async () => {
    const confirmed = await showConfirm({
      title: t('解绑手机号'),
      message: t('确定要解绑手机号吗？解绑后将无法通过手机号登录。'),
      confirmText: t('确认解绑'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;
    setUnbindMode(true);
    setIsEditingPhone(true);
    setPhoneStep('verifyOld');
    setPhoneForm({ phone: '', code: '' });
    setError(null);
    setSuccess(null);
  };

  const handleSetEditingPhone = (editing: boolean) => {
    if (editing) {
      // 换绑入口：确保退出解绑模式
      setUnbindMode(false);
      setIsEditingPhone(true);
      setPhoneStep('verifyOld');
      setPhoneForm({ phone: '', code: '' });
      setError(null);
      setSuccess(null);
    } else {
      setIsEditingPhone(false);
      setPhoneStep('verifyOld');
      setPhoneForm({ phone: '', code: '' });
      setVerifyToken('');
      setUnbindMode(false);
      setError(null);
      setSuccess(null);
    }
  };

  return {
    phoneForm,
    setPhoneForm,
    phoneStep,
    setPhoneStep,
    isEditingPhone,
    setIsEditingPhone,
    verifyToken,
    countdown,
    sendingCode,
    handlePhoneChange,
    handleSendPhoneCode,
    handleSendUnbindCode,
    handleVerifyOldPhone,
    handleSendNewPhoneCode,
    handleRebindPhone,
    handleBindPhone,
    handleStartUnbind,
    handleSetEditingPhone,
    unbindMode,
  };
}
