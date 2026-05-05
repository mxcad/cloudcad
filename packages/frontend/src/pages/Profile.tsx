import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { useWechatAuth } from '../hooks/useWechatAuth';
import { usePermission } from '../hooks/usePermission';
import { useNotification } from '../contexts/NotificationContext';
import {
  usersControllerChangePassword,
  usersControllerDeactivateAccount,
  authControllerBindWechat,
  authControllerSendBindEmailCode,
  authControllerVerifyBindEmail,
  authControllerSendUnbindEmailCode,
  authControllerVerifyUnbindEmailCode,
  authControllerRebindEmail,
  authControllerSendSmsCode,
  authControllerSendUnbindPhoneCode,
  authControllerVerifyUnbindPhoneCode,
  authControllerBindPhone,
  authControllerRebindPhone,
  authControllerUnbindWechat,
  authControllerResendVerification,
} from '@/api-sdk';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';
import {
  ArrowLeft,
  Shield,
  Key,
  User,
  Mail,
  Phone,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Crown,
} from 'lucide-react';
// @ts-ignore
import { ProfileInfoTab, ProfilePasswordTab, ProfileEmailTab, ProfilePhoneTab, ProfileWechatTab, ProfileDeactivateTab } from './components';

type TabType =
  | 'info'
  | 'password'
  | 'email'
  | 'deactivate'
  | 'phone'
  | 'wechat';

export const Profile: React.FC = () => {
  useDocumentTitle('个人资料');
  const navigate = useNavigate();
  const { user, logout, login, refreshUser } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isAdmin } = usePermission();
  const { isDark } = useTheme();
  const { showToast, showConfirm } = useNotification();

  const mailEnabled = runtimeConfig.mailEnabled;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig.wechatEnabled ?? false;

  const [activeTab, setActiveTab] = useState<TabType>('info');

  const visibleTabs: TabType[] = [
    'info',
    'password',
    ...(mailEnabled ? (['email'] as TabType[]) : []),
    ...(smsEnabled ? (['phone'] as TabType[]) : []),
    ...(wechatEnabled ? (['wechat'] as TabType[]) : []),
    'deactivate',
  ];

  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    width: 0,
    transform: 0,
  });

  useLayoutEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const buttons =
      container.querySelectorAll<HTMLButtonElement>('.tab-button');
    const activeButton = buttons[visibleTabs.indexOf(activeTab)];
    if (activeButton) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setIndicatorStyle({
        width: buttonRect.width,
        transform: buttonRect.left - containerRect.left,
      });
    }
  }, [activeTab, visibleTabs.length]);

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const [deactivateForm, setDeactivateForm] = useState(() => {
    const savedMethod = sessionStorage.getItem(
      'deactivate_verification_method'
    );
    return {
      verificationMethod: (savedMethod || '') as
        | 'password'
        | 'phone'
        | 'email'
        | 'wechat'
        | '',
      password: '',
      phoneCode: '',
      emailCode: '',
      wechatConfirm: savedMethod === 'wechat' ? 'confirmed' : '',
      confirmed: false,
      immediate: false,
    };
  });
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateCountdown, setDeactivateCountdown] = useState(0);

  useEffect(() => {
    if (!deactivateForm.verificationMethod && user) {
      if (user.hasPassword)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'password' }));
      else if (user.phone && user.phoneVerified)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'phone' }));
      else if (user.email)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'email' }));
      else if (user.wechatId)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'wechat' }));
    }
  }, [user, deactivateForm.verificationMethod]);

  const [emailForm, setEmailForm] = useState({ email: '', code: '' });
  const [emailStep, setEmailStep] = useState<
    'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew'
  >('input');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailVerifyToken, setEmailVerifyToken] = useState<string>('');

  const [phoneForm, setPhoneForm] = useState({ phone: '', code: '' });
  const [phoneStep, setPhoneStep] = useState<
    'verifyOld' | 'inputNew' | 'verifyNew'
  >('verifyOld');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string>('');
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { open: wechatBindOpen } = useWechatAuth({
    purpose: 'bind',
    onSuccess: async (result) => {
      try {
        const bindRes = await authControllerBindWechat({ body: { code: result.code!, state: result.state! } } as any) as unknown as { success?: boolean; message?: string };
        if (bindRes?.success) {
          setSuccess('微信绑定成功');
          await refreshUser();
        } else {
          setError(bindRes?.message || '绑定失败');
        }
      } catch (bindErr) {
        setError(
          (bindErr as Error & { response?: { data?: { message?: string } } })
            ?.response?.data?.message ||
            (bindErr as Error).message ||
            '绑定失败'
        );
      }
      setLoading(false);
    },
    onError: (errorMsg) => {
      setError(errorMsg);
      setLoading(false);
    },
  });

  const getPasswordStrength = (
    password: string
  ): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const levels = [
      { label: '太弱', color: '#ef4444' },
      { label: '较弱', color: '#f97316' },
      { label: '一般', color: '#eab308' },
      { label: '较强', color: '#22c55e' },
      { label: '很强', color: '#10b981' },
    ];
    return {
      strength: score,
      label: levels[score]?.label || levels[0]!.label,
      color: levels[score]?.color || levels[0]!.color,
    };
  };
  const passwordStrength = getPasswordStrength(passwordForm.newPassword);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('wechat_result')) {
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (hashValue) {
          const result = JSON.parse(decodeURIComponent(hashValue));
          if (result.purpose === 'bind') setActiveTab('wechat');
          else if (result.purpose === 'deactivate') setActiveTab('deactivate');
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current && countdown <= 0)
        clearInterval(countdownRef.current);
    };
  }, [countdown > 0]);

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setPasswordForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success]
  );

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setEmailForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success]
  );

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致');
      setLoading(false);
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setError('新密码至少需要6个字符');
      setLoading(false);
      return;
    }
    if (user?.hasPassword !== false && !passwordForm.oldPassword) {
      setError('请输入当前密码');
      setLoading(false);
      return;
    }
    try {
      await usersControllerChangePassword({
        body: {
          oldPassword:
            user?.hasPassword === false ? undefined : passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        },
      } as any);
      
      // 使用新密码自动登录
      if (user?.username) {
        try {
          await login(user.username, passwordForm.newPassword);
          setSuccess(`密码已${user?.hasPassword === false ? '设置' : '修改'}成功`);
        } catch (loginErr) {
          console.error('Auto login error:', loginErr);
          // 自动登录失败时，强制退出登录
          try {
            await logout();
          } catch (logoutErr) {
            console.error('Logout error:', logoutErr);
          }
          navigate('/login', {
            state: {
              message: `密码已${user?.hasPassword === false ? '设置' : '修改'}成功，请使用新密码登录`,
            },
          });
        }
      } else {
        // 如果没有用户名，强制退出登录
        try {
          await logout();
        } catch (logoutErr) {
          console.error('Logout error:', logoutErr);
        }
        navigate('/login', {
          state: {
            message: `密码已${user?.hasPassword === false ? '设置' : '修改'}成功，请使用新密码登录`,
          },
        });
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '密码修改失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendBindCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!emailForm.email) {
      setError('请输入邮箱地址');
      setLoading(false);
      return;
    }
    try {
      await authControllerSendBindEmailCode({ body: { email: emailForm.email } } as any);
      setEmailStep('verify');
      setSuccess('验证码已发送到您的邮箱');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authControllerVerifyBindEmail({ body: { email: emailForm.email, code: emailForm.code } } as any);
      setSuccess('邮箱绑定成功');
      setEmailStep('input');
      setEmailForm({ email: '', code: '' });
      await refreshUser();
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '验证失败'
      );
    } finally {
      setLoading(false);
    }
  };

  // 邮箱换绑相关
  const handleSendUnbindEmailCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      const response = await authControllerSendUnbindEmailCode() as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('验证码已发送到原邮箱');
        setCountdown(60);
      } else {
        setError(response?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyOldEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!emailForm.code || !/^\d{6}$/.test(emailForm.code)) {
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerVerifyUnbindEmailCode({
        body: { code: emailForm.code },
      } as any) as unknown as { success?: boolean; message?: string; token?: string };
      if (response?.success) {
        setSuccess('原邮箱验证通过');
        setEmailVerifyToken(response.token || '');
        setEmailStep('inputNew');
        setEmailForm({ email: '', code: '' });
      } else {
        setError(response?.message || '验证失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '验证失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSetEditingEmail = (editing: boolean) => {
    if (editing) {
      // 开始换绑流程
      setIsEditingEmail(true);
      setEmailStep('verifyOld');
      setEmailForm({ email: '', code: '' });
      setError(null);
      setSuccess(null);
    } else {
      // 取消换绑流程
      setIsEditingEmail(false);
      setEmailStep('input');
      setEmailForm({ email: '', code: '' });
      setEmailVerifyToken('');
      setError(null);
      setSuccess(null);
    }
  };

  const handleSendNewEmailCode = async () => {
    if (
      !emailForm.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)
    ) {
      setError('请输入正确的邮箱地址');
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      await authControllerSendBindEmailCode({ body: { email: emailForm.email, isRebind: true } } as any);
      setSuccess('验证码已发送');
      setCountdown(60);
      setEmailStep('verifyNew');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleRebindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (
      !emailForm.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)
    ) {
      setError('请输入正确的邮箱地址');
      setLoading(false);
      return;
    }
    if (!emailForm.code || !/^\d{6}$/.test(emailForm.code)) {
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    if (!emailVerifyToken) {
      setError('请先验证原邮箱');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerRebindEmail({
        body: { email: emailForm.email, code: emailForm.code, token: emailVerifyToken },
      } as any) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('邮箱换绑成功');
        setEmailStep('input');
        setEmailForm({ email: '', code: '' });
        setEmailVerifyToken('');
        setIsEditingEmail(false);
        await refreshUser();
      } else {
        setError(response?.message || '换绑失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '换绑失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      if (name === 'phone' && value && !/^\d*$/.test(value)) return;
      if (name === 'code' && value && !/^\d*$/.test(value)) return;
      setPhoneForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success]
  );

  const handleSendPhoneCode = async () => {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError('请输入正确的手机号');
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await authControllerSendSmsCode({ body: { phone: phoneForm.phone } } as any) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        setError(response?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleSendUnbindCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      const response = await authControllerSendUnbindPhoneCode() as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('验证码已发送到原手机号');
        setCountdown(60);
      } else {
        setError(response?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
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
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerVerifyUnbindPhoneCode({
        body: { code: phoneForm.code },
      } as any) as unknown as { success?: boolean; message?: string; token?: string };
      if (response?.success) {
        setSuccess('原手机号验证通过');
        setVerifyToken(response.token || '');
        setPhoneStep('inputNew');
        setPhoneForm({ phone: '', code: '' });
        setCountdown(0);
      } else {
        setError(response?.message || '验证失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '验证失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendNewPhoneCode = async () => {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError('请输入正确的手机号');
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await authControllerSendSmsCode({ body: { phone: phoneForm.phone } } as any) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        setError(response?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
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
      setError('请输入正确的手机号');
      setLoading(false);
      return;
    }
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    if (!verifyToken) {
      setError('请先验证原手机号');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerRebindPhone({
        body: { phone: phoneForm.phone, code: phoneForm.code, token: verifyToken },
      } as any) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('手机号换绑成功');
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setVerifyToken('');
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response?.message || '换绑失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '换绑失败'
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
      setError('请输入正确的手机号');
      setLoading(false);
      return;
    }
    if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
      setError('请输入6位数字验证码');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerBindPhone({ body: { phone: phoneForm.phone, code: phoneForm.code } } as any) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('手机号绑定成功');
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response?.message || '绑定失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '绑定失败'
      );
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  };

  const handleUnbindWechat = async () => {
    const confirmed = await showConfirm({
      title: '解绑微信',
      message: '确定要解绑微信吗？解绑后需要重新绑定。',
      confirmText: '确认解绑',
      cancelText: '取消',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      setError(null);
      const response = await authControllerUnbindWechat() as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        showToast('微信解绑成功', 'success');
        setSuccess('微信解绑成功');
        await refreshUser();
      } else {
        setError(response?.message || '解绑失败');
        showToast(response?.message || '解绑失败', 'error');
      }
    } catch (err) {
      const errorMsg =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        '解绑失败';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      setDeactivateLoading(true);
      setError(null);
      
      // 首先执行软删除（必须的步骤）
      await usersControllerDeactivateAccount({
        body: {
          password: deactivateForm.password || undefined,
          phoneCode: deactivateForm.phoneCode || undefined,
          emailCode: deactivateForm.emailCode || undefined,
          wechatConfirm: deactivateForm.wechatConfirm || undefined,
        },
      });
      
      setSuccess('账户已注销，30天后自动清理数据');
      
      setTimeout(() => {
        logout();
      }, 1500);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '注销失败'
      );
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleSendDeactivatePhoneCode = async () => {
    try {
      if (!user?.phone) {
        setError('手机号不存在');
        return;
      }
      await authControllerSendSmsCode({ body: { phone: (user.phone as any) as string } } as any);
      setDeactivateCountdown(60);
      const timer = setInterval(() => {
        setDeactivateCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    }
  };

  const handleSendDeactivateEmailCode = async () => {
    try {
      if (!user?.email) {
        setError('邮箱不存在');
        return;
      }
      await authControllerResendVerification({ body: { email: (user.email as any) as string } } as any);
      setDeactivateCountdown(60);
      const timer = setInterval(() => {
        setDeactivateCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    }
  };

  return (
    <div className="profile-page" data-theme={isDark ? 'dark' : 'light'}>
      <button className="back-button" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>

      <div className="profile-container">
        <div className="profile-card">
          <div className="profile-header">
            <div className="avatar-section">
              <div className="avatar-wrapper">
                <div className="avatar-glow" />
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="Avatar"
                    className="avatar-image"
                  />
                ) : (
                  <div className="avatar-placeholder">
                    <User size={40} />
                  </div>
                )}
                <div className="avatar-badge">
                  <Crown size={12} />
                </div>
              </div>
              <div className="user-info">
                <h1 className="user-name">
                  {user?.nickname || user?.username || '用户'}
                </h1>
                <p className="user-role">
                  <Shield size={14} />
                  {isAdmin() ? '系统管理员' : '普通用户'}
                </p>
              </div>
            </div>
          </div>

          <div className="tabs-container" ref={tabsContainerRef}>
            <button
              onClick={() => switchTab('info')}
              className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
            >
              <User size={16} />
              <span>个人信息</span>
            </button>
            <button
              onClick={() => switchTab('password')}
              className={`tab-button ${activeTab === 'password' ? 'active' : ''}`}
            >
              <Key size={16} />
              <span>
                {user?.hasPassword === false ? '设置密码' : '修改密码'}
              </span>
            </button>
            {mailEnabled && (
              <button
                onClick={() => switchTab('email')}
                className={`tab-button ${activeTab === 'email' ? 'active' : ''}`}
              >
                <Mail size={16} />
                <span>邮箱绑定</span>
              </button>
            )}
            {smsEnabled && (
              <button
                onClick={() => switchTab('phone')}
                className={`tab-button ${activeTab === 'phone' ? 'active' : ''}`}
              >
                <Phone size={16} />
                <span>手机绑定</span>
              </button>
            )}
            {wechatEnabled && (
              <button
                onClick={() => switchTab('wechat')}
                className={`tab-button ${activeTab === 'wechat' ? 'active' : ''}`}
              >
                <MessageCircle size={16} />
                <span>微信绑定</span>
              </button>
            )}
            <button
              onClick={() => switchTab('deactivate')}
              className={`tab-button ${activeTab === 'deactivate' ? 'active' : ''}`}
            >
              <AlertTriangle size={16} />
              <span>注销账户</span>
            </button>
            <div
              className="tab-indicator"
              style={{
                width: `${indicatorStyle.width}px`,
                transform: `translateX(${indicatorStyle.transform}px)`,
              }}
            />
          </div>

          {success && (
            <div className="alert alert-success">
              <CheckCircle size={18} className="alert-icon" />
              <span>{success}</span>
            </div>
          )}
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} className="alert-icon" />
              <span>{error}</span>
            </div>
          )}

          <div className="content-area">
            {activeTab === 'info' && <ProfileInfoTab user={user as any} />}

            {activeTab === 'password' && (
              <ProfilePasswordTab
                user={user}
                passwordForm={passwordForm}
                showPassword={showPassword}
                focusedField={focusedField}
                passwordStrength={passwordStrength}
                loading={loading}

  
                onPasswordChange={handlePasswordChange}
                onPasswordSubmit={handlePasswordSubmit}
                onTogglePassword={(field: any) =>
                  setShowPassword((p) => ({ ...p, [field]: !(p as any)[field] }))
                }
                onFocusField={setFocusedField}
                onNavigate={navigate}
              />
            )}

            {activeTab === 'email' && (
              <ProfileEmailTab
                user={user as any}
                emailForm={emailForm}
                emailStep={emailStep}
                isEditingEmail={isEditingEmail}
                verifyToken={emailVerifyToken}
                countdown={countdown}
                sendingCode={sendingCode}
                loading={loading}


                focusedField={focusedField}
                mailEnabled={mailEnabled}
                onEmailChange={handleEmailChange}
                onSendBindCode={handleSendBindCode}
                onVerifyBindEmail={handleVerifyBindEmail}
                onFocusField={setFocusedField}
                onSendUnbindCode={handleSendUnbindEmailCode}
                onVerifyOldEmail={handleVerifyOldEmail}
                onSendNewEmailCode={handleSendNewEmailCode}
                onRebindEmail={handleRebindEmail}
                onSetEditingEmail={handleSetEditingEmail}
              />
            )}

            {activeTab === 'phone' && smsEnabled && (
              <ProfilePhoneTab
                user={user as any}
                phoneForm={phoneForm}
                phoneStep={phoneStep}
                isEditingPhone={isEditingPhone}
                verifyToken={verifyToken}
                countdown={countdown}
                sendingCode={sendingCode}
                loading={loading}
 
     
                focusedField={focusedField}
                onPhoneChange={handlePhoneChange}
                onSendPhoneCode={handleSendPhoneCode}
                onSendUnbindCode={handleSendUnbindCode}
                onVerifyOldPhone={handleVerifyOldPhone}
                onSendNewPhoneCode={handleSendNewPhoneCode}
                onRebindPhone={handleRebindPhone}
                onBindPhone={handleBindPhone}
                onFocusField={setFocusedField}
                onSetEditingPhone={setIsEditingPhone}
              />
            )}

            {activeTab === 'wechat' && wechatEnabled && (
              <ProfileWechatTab
                user={user as any}
                loading={loading}
    
 
                onBind={wechatBindOpen}
                onUnbind={handleUnbindWechat}
              />
            )}

            {activeTab === 'deactivate' && (
              <ProfileDeactivateTab
                user={user as any}
                deactivateForm={deactivateForm}
                showPassword={showPassword}
                deactivateLoading={deactivateLoading}
                deactivateCountdown={deactivateCountdown}
                loading={loading}
                onVerificationMethodChange={(method: any) =>
                  setDeactivateForm((f) => ({
                    ...f,
                    verificationMethod: method,
                    password: '',
                    phoneCode: '',
                    emailCode: '',
                    wechatConfirm: '',
                  }))
                }
                onPasswordChange={(password: any) =>
                  setDeactivateForm((f) => ({ ...f, password }))
                }
                onPhoneCodeChange={(phoneCode: any) =>
                  setDeactivateForm((f) => ({ ...f, phoneCode }))
                }
                onEmailCodeChange={(emailCode: any) =>
                  setDeactivateForm((f) => ({ ...f, emailCode }))
                }
                onConfirmedChange={(confirmed: any) =>
                  setDeactivateForm((f) => ({ ...f, confirmed }))
                }
                onImmediateChange={(immediate: any) =>
                  setDeactivateForm((f) => ({ ...f, immediate }))
                }
                onSendPhoneCode={handleSendDeactivatePhoneCode}
                onSendEmailCode={handleSendDeactivateEmailCode}
                onWechatConfirm={() => {
                  setDeactivateForm((f) => ({
                    ...f,
                    wechatConfirm: 'confirmed',
                  }));
                  setSuccess('微信验证成功');
                }}
                onDeactivate={handleDeactivate}
                onTogglePassword={(field: any) =>
                  setShowPassword((p) => ({ ...p, [field]: !(p as any)[field] }))
                }
                onShowConfirm={showConfirm}
                onLogout={logout}
              />
            )}
          </div>
        </div>
      </div>

      <style>{`
        .profile-page { min-height: 100vh; position: relative; overflow: hidden; font-family: var(--font-family-base); background: transparent; padding: 2rem; }
  );
};

export default Profile;
