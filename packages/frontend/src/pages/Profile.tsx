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
import { usersApi } from '../services/usersApi';
import { authApi } from '../services/authApi';
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
import {
  ProfileInfoTab,
  ProfilePasswordTab,
  ProfileEmailTab,
  ProfilePhoneTab,
  ProfileWechatTab,
  ProfileDeactivateTab,
} from './components';

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
        const bindRes = await authApi.bindWechat(result.code!, result.state!);
        if (bindRes.data?.success) {
          setSuccess('微信绑定成功');
          await refreshUser();
        } else {
          setError(bindRes.data?.message || '绑定失败');
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
      await usersApi.changePassword({
        oldPassword:
          user?.hasPassword === false ? undefined : passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      
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
      await authApi.sendBindEmailCode(emailForm.email);
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
      await authApi.verifyBindEmail(emailForm.email, emailForm.code);
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
      const response = await authApi.sendUnbindEmailCode();
      if (response.data?.success) {
        setSuccess('验证码已发送到原邮箱');
        setCountdown(60);
      } else {
        setError(response.data?.message || '发送验证码失败');
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
      const response = await authApi.verifyUnbindEmailCode(emailForm.code);
      if (response.data?.success) {
        setSuccess('原邮箱验证通过');
        setEmailVerifyToken(response.data.token);
        setEmailStep('inputNew');
        setEmailForm({ email: '', code: '' });
      } else {
        setError(response.data?.message || '验证失败');
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
      const response = await authApi.sendBindEmailCode(emailForm.email, true);
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
      const response = await authApi.rebindEmail(
        emailForm.email,
        emailForm.code,
        emailVerifyToken
      );
      if (response.data?.success) {
        setSuccess('邮箱换绑成功');
        setEmailStep('input');
        setEmailForm({ email: '', code: '' });
        setEmailVerifyToken('');
        setIsEditingEmail(false);
        await refreshUser();
      } else {
        setError(response.data?.message || '换绑失败');
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
      const response = await authApi.sendSmsCode(phoneForm.phone);
      if (response.data?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        setError(response.data?.message || '发送验证码失败');
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
      const response = await authApi.sendUnbindPhoneCode();
      if (response.data?.success) {
        setSuccess('验证码已发送到原手机号');
        setCountdown(60);
      } else {
        setError(response.data?.message || '发送验证码失败');
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
      const response = await authApi.verifyUnbindPhoneCode(phoneForm.code);
      if (response.data?.success) {
        setSuccess('原手机号验证通过');
        setVerifyToken(response.data.token);
        setPhoneStep('inputNew');
        setPhoneForm({ phone: '', code: '' });
        setCountdown(0);
      } else {
        setError(response.data?.message || '验证失败');
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
      const response = await authApi.sendSmsCode(phoneForm.phone);
      if (response.data?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        setError(response.data?.message || '发送验证码失败');
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
      const response = await authApi.rebindPhone(
        phoneForm.phone,
        phoneForm.code,
        verifyToken
      );
      if (response.data?.success) {
        setSuccess('手机号换绑成功');
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setVerifyToken('');
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response.data?.message || '换绑失败');
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
      const response = await authApi.bindPhone(phoneForm.phone, phoneForm.code);
      if (response.data?.success) {
        setSuccess('手机号绑定成功');
        setPhoneStep('verifyOld');
        setPhoneForm({ phone: '', code: '' });
        setIsEditingPhone(false);
        await refreshUser();
      } else {
        setError(response.data?.message || '绑定失败');
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
      const { authApi: localAuthApi } = await import('../services/authApi');
      const response = await localAuthApi.unbindWechat();
      if (response.data?.success) {
        showToast('微信解绑成功', 'success');
        setSuccess('微信解绑成功');
        await refreshUser();
      } else {
        setError(response.data?.message || '解绑失败');
        showToast(response.data?.message || '解绑失败', 'error');
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
      await usersApi.deactivateAccount({
        password: deactivateForm.password || undefined,
        phoneCode: deactivateForm.phoneCode || undefined,
        emailCode: deactivateForm.emailCode || undefined,
        wechatConfirm: deactivateForm.wechatConfirm || undefined,
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
      await authApi.sendSmsCode((user.phone as any) as string);
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
      await authApi.resendVerification((user.email as any) as string);
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
                onTogglePassword={(field) =>
                  setShowPassword((p) => ({ ...p, [field]: !p[field] }))
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
                onVerificationMethodChange={(method) =>
                  setDeactivateForm((f) => ({
                    ...f,
                    verificationMethod: method,
                    password: '',
                    phoneCode: '',
                    emailCode: '',
                    wechatConfirm: '',
                  }))
                }
                onPasswordChange={(password) =>
                  setDeactivateForm((f) => ({ ...f, password }))
                }
                onPhoneCodeChange={(phoneCode) =>
                  setDeactivateForm((f) => ({ ...f, phoneCode }))
                }
                onEmailCodeChange={(emailCode) =>
                  setDeactivateForm((f) => ({ ...f, emailCode }))
                }
                onConfirmedChange={(confirmed) =>
                  setDeactivateForm((f) => ({ ...f, confirmed }))
                }
                onImmediateChange={(immediate) =>
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
                onTogglePassword={(field) =>
                  setShowPassword((p) => ({ ...p, [field]: !p[field] }))
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
        .back-button { position: fixed; top: 1.5rem; left: 1.5rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-lg); color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; z-index: 10; backdrop-filter: blur(10px); }
        .back-button:hover { background: var(--bg-tertiary); border-color: var(--border-strong); transform: translateX(-2px); }
        .profile-container { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; padding-top: 3rem; }
        .profile-card { background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 24px; overflow: hidden; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; animation: card-appear 0.6s ease-out; }
        @keyframes card-appear { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .profile-header { padding: 2.5rem 2rem 1.5rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%); border-bottom: 1px solid var(--border-default); }
        .avatar-section { display: flex; align-items: center; gap: 1.5rem; }
        .avatar-wrapper { position: relative; width: 80px; height: 80px; }
        .avatar-glow { position: absolute; inset: -4px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); border-radius: 50%; opacity: 0.3; filter: blur(15px); animation: avatar-pulse 3s ease-in-out infinite; }
        @keyframes avatar-pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
        .avatar-image, .avatar-placeholder { position: relative; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; z-index: 1; border: 3px solid var(--bg-secondary); }
        .avatar-placeholder { background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); display: flex; align-items: center; justify-content: center; color: white; }
        .avatar-badge { position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; background: linear-gradient(135deg, #f59e0b, #fbbf24); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; z-index: 2; border: 2px solid var(--bg-secondary); }
        .user-info { flex: 1; }
        .user-name { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.375rem; }
        .user-role { display: flex; align-items: center; gap: 0.375rem; font-size: 0.875rem; color: var(--text-tertiary); }
        .tabs-container { position: relative; display: flex; padding: 0.5rem; background: var(--bg-tertiary); margin: 1.5rem 2rem 0; border-radius: var(--radius-xl); }
        .tab-button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: transparent; border: none; border-radius: var(--radius-lg); color: var(--text-tertiary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease; position: relative; z-index: 1; }
        .tab-button:hover { color: var(--text-secondary); }
        .tab-button.active { color: var(--text-primary); }
        .tab-indicator { position: absolute; top: 0.5rem; left: 0; height: calc(100% - 1rem); background: var(--bg-secondary); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 0; }
        .alert { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; border-radius: 12px; margin: 1.5rem 2rem 0; font-size: 0.875rem; animation: slide-up 0.3s ease-out; }
        .alert-success { background: var(--success-dim); border: 1px solid var(--success); color: var(--success); }
        .alert-error { background: var(--error-dim); border: 1px solid var(--error); color: var(--error); }
        .alert-icon { flex-shrink: 0; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .content-area { padding: 1.5rem 2rem 2rem; }
        .tab-content { animation: fade-in 0.3s ease-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
        .info-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 16px; transition: all 0.3s ease; }
        .info-card:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .info-icon-wrapper { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .info-icon-wrapper.primary { background: linear-gradient(135deg, var(--primary-500), var(--primary-600)); color: white; }
        .info-icon-wrapper.accent { background: linear-gradient(135deg, var(--accent-500), var(--accent-600)); color: white; }
        .info-icon-wrapper.success { background: linear-gradient(135deg, var(--success), #16a34a); color: white; }
        .info-icon-wrapper.warning { background: linear-gradient(135deg, var(--warning), #d97706); color: white; }
        .info-icon-wrapper.info { background: linear-gradient(135deg, var(--info), #2563eb); color: white; }
        .info-icon-wrapper.purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
        .info-content { flex: 1; min-width: 0; }
        .info-content label { display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
        .info-content span { display: block; font-size: 0.9375rem; color: var(--text-primary); font-weight: 500; }
        .role-badge, .status-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .role-badge { background: linear-gradient(135deg, var(--primary-100), var(--primary-200)); color: var(--primary-700); }
        .status-badge.active { background: var(--success-dim); color: var(--success); }
        .status-badge.inactive { background: var(--warning-dim); color: var(--warning); }
        .status-badge.disabled { background: var(--error-dim); color: var(--error); }
        .password-form, .email-form { max-width: 400px; margin: 0 auto; }
        .input-group { margin-bottom: 1.25rem; }
        .input-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 0.5rem; transition: color 0.2s; }
        .input-group.focused .input-label { color: var(--primary-500); }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-wrapper.has-button { padding-right: 0; }
        .code-button { position: absolute; right: 0.5rem; padding: 0.5rem 0.875rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 8px; color: var(--primary-500); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .code-button:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--primary-500); }
        .code-button:disabled { opacity: 0.6; cursor: not-allowed; color: var(--text-muted); }
        .verify-notice, .verify-success { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; border-radius: 12px; font-size: 0.875rem; }
        .verify-notice { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: var(--warning-500); }
        .verify-success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: var(--success-500); }
        .notice-text { font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: var(--bg-tertiary); border-radius: 8px; }
        .button-group { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
        .back-button-form { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.875rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .back-button-form:hover { background: var(--bg-tertiary); border-color: var(--border-strong); }
        .email-preview { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; background: var(--bg-tertiary); border-radius: 12px; font-size: 0.9375rem; color: var(--text-primary); font-weight: 500; }
        .info-text { margin-bottom: 1.25rem; padding: 0.75rem 1rem; background: var(--bg-tertiary); border-radius: 12px; font-size: 0.875rem; color: var(--text-secondary); text-align: center; }
        .input-wrapper input { width: 100%; padding: 0.875rem 1rem; padding-right: 2.75rem; background: var(--bg-primary); border: 1px solid var(--border-default); border-radius: 12px; color: var(--text-primary); font-size: 0.9375rem; transition: all 0.2s; outline: none; }
        .input-wrapper input::placeholder { color: var(--text-muted); }
        .input-wrapper input:hover { border-color: var(--border-strong); }
        .input-wrapper input:focus { border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .input-glow { position: absolute; inset: -2px; border-radius: 14px; background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); opacity: 0; z-index: -1; transition: opacity 0.3s; filter: blur(8px); }
        .input-group.focused .input-glow { opacity: 0.25; }
        .toggle-password { position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; transition: color 0.2s; }
        .toggle-password:hover { color: var(--text-secondary); }
        .password-strength { margin-top: 0.5rem; display: flex; align-items: center; gap: 0.75rem; }
        .strength-bar { flex: 1; height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden; }
        .strength-fill { height: 100%; border-radius: 2px; transition: all 0.3s ease; }
        .strength-label { font-size: 0.75rem; font-weight: 500; }
        .submit-button { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.875rem 1.5rem; background: linear-gradient(135deg, var(--primary-600), var(--accent-600)); border: none; border-radius: 12px; color: white; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); margin-top: 0.5rem; }
        .submit-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4); }
        .submit-button:active:not(:disabled) { transform: translateY(0); }
        .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }
        .animate-spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .field-hint { margin-top: 0.5rem; text-align: right; }
        .forgot-password-link { background: none; border: none; color: var(--primary-500); font-size: 0.8125rem; cursor: pointer; padding: 0; transition: color 0.2s; }
        .forgot-password-link:hover { color: var(--primary-600); text-decoration: underline; }
        .no-password-hint { display: flex; align-items: flex-start; gap: 1rem; padding: 1.25rem; background: linear-gradient(135deg, var(--primary-50) 0%, var(--primary-100) 100%); border: 1px solid var(--primary-200); border-radius: 12px; margin-bottom: 1.5rem; }
        [data-theme='dark'] .no-password-hint { background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.15) 100%); border-color: rgba(59, 130, 246, 0.3); }
        .no-password-hint .hint-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--primary-500); border-radius: 12px; color: white; flex-shrink: 0; }
        .no-password-hint .hint-content h4 { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 0.5rem 0; }
        .no-password-hint .hint-content p { font-size: 0.875rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        .security-tips { margin-top: 1.5rem; padding: 1.25rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; }
        .security-tips h4 { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.75rem; }
        .security-tips ul { list-style: none; padding: 0; margin: 0; }
        .security-tips li { position: relative; padding-left: 1rem; font-size: 0.8125rem; color: var(--text-tertiary); margin-bottom: 0.375rem; }
        .security-tips li::before { content: ''; position: absolute; left: 0; top: 0.5rem; width: 4px; height: 4px; background: var(--primary-500); border-radius: 50%; }
        .email-bound, .email-disabled, .phone-bound { text-align: center; padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; }
        .success-icon, .warning-icon { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
        .success-icon { background: var(--success-dim); color: var(--success); }
        .warning-icon { background: var(--warning-dim); color: var(--warning); }
        .email-bound h3, .email-disabled h3, .phone-bound h3 { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
        .bound-email, .bound-phone { font-size: 1rem; color: var(--primary-500); font-weight: 500; margin-bottom: 1.5rem; }
        .email-disabled p { font-size: 0.875rem; color: var(--text-tertiary); max-width: 300px; margin: 0 auto; }
        .benefits { display: flex; flex-direction: column; gap: 0.75rem; max-width: 240px; margin: 0 auto; padding: 1rem; background: var(--bg-tertiary); border-radius: 12px; border: 1px solid var(--border-subtle); }
        .benefit-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary); }
        .benefit-item svg { color: var(--success-500); }
        .benefit-icon { color: var(--success); }
        .email-preview { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 1rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 12px; margin-bottom: 1.25rem; color: var(--text-secondary); font-weight: 500; }
        input[type="password"]::-ms-reveal, input[type="password"]::-ms-clear { display: none; }
        input[type="password"]::-webkit-credentials-auto-fill-button { visibility: hidden; display: none !important; pointer-events: none; }
        input[type="password"]::-webkit-textfield-decoration-container { display: none; }
        [data-theme="dark"] .profile-card { background: rgba(26, 29, 33, 0.9); backdrop-filter: blur(20px); box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset; }
        [data-theme="dark"] .input-wrapper input { background: var(--bg-primary); }
        [data-theme="dark"] .info-card { background: var(--bg-primary); }
        .wechat-bind-content { max-width: 500px; margin: 0 auto; }
        .wechat-bound, .wechat-unbound { text-align: center; padding: 2rem; display: flex; flex-direction: column; align-items: center; }
        .wechat-bound .success-icon, .wechat-unbound .unbound-icon { margin-bottom: 1.5rem; color: var(--success-500); }
        .wechat-unbound .unbound-icon { color: var(--text-muted); opacity: 0.5; }
        .wechat-bound h3, .wechat-unbound h3 { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
        .wechat-bound .bound-info, .wechat-unbound .unbound-desc { color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.5rem; }

        .submit-button.wechat { background: #07c160; border-color: #07c160; color: white; }
        .submit-button.wechat:hover { background: #06ad56; border-color: #06ad56; box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3); }
        .submit-button.danger { background: var(--bg-secondary); border: 1px solid var(--border-default); color: var(--text-secondary); }
        .submit-button.danger:hover { background: #ef4444; border-color: #ef4444; color: white; }
        .deactivate-content { max-width: 500px; margin: 0 auto; text-align: center; padding: 2rem; }
        .deactivate-content .warning-icon { color: var(--error-500); margin-bottom: 1.5rem; }
        .deactivate-content h3 { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; }
        .deactivate-content .warning-text { color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.6; }
        .deactivate-content .warning-list { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 2rem; text-align: left; }
        .deactivate-content .warning-item { display: flex; align-items: center; gap: 0.5rem; color: var(--error-500); font-size: 0.875rem; margin-bottom: 0.5rem; }
        .deactivate-content .warning-item:last-child { margin-bottom: 0; }
        .deactivate-form .confirm-checkbox { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; }
        .deactivate-form .confirm-checkbox input { width: 16px; height: 16px; accent-color: var(--error-500); }
        .deactivate-form .confirm-checkbox label { font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; }
        .deactivate-form .verification-select { width: 100%; padding: 0.75rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.875rem; cursor: pointer; transition: all 0.2s ease; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.5rem; }
        .deactivate-form .verification-select:hover { border-color: var(--primary-400); }
        .deactivate-form .verification-select:focus { outline: none; border-color: var(--primary-500); box-shadow: 0 0 0 3px rgba(var(--primary-500-rgb), 0.1); }
        .wechat-warning { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(7, 193, 96, 0.08), rgba(7, 193, 96, 0.04)); border: 1px solid rgba(7, 193, 96, 0.2); border-radius: var(--radius-lg); margin-top: 0.5rem; }
        .wechat-warning > svg { color: #07c160; }
        .wechat-warning > p { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.875rem; margin: 0; }
        .wechat-warning .submit-button { display: inline-flex; align-items: center; gap: 0.5rem; background: #07c160; border-color: #07c160; color: white; padding: 0.625rem 1.25rem; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; transition: all 0.2s ease; }
        .wechat-warning .submit-button:hover:not(:disabled) { background: #06ad56; border-color: #06ad56; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(7, 193, 96, 0.3); }
        .wechat-warning .submit-button:disabled { opacity: 0.7; cursor: not-allowed; }
        .wechat-warning.success { background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05)); border-color: rgba(34, 197, 94, 0.3); }
        .wechat-warning.success > svg { color: #22c55e; }
        .wechat-warning.success > p { color: #22c55e; font-weight: 500; }
        .send-code-button { position: absolute; right: 0.5rem; padding: 0.5rem 0.875rem; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 8px; color: var(--primary-500); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .send-code-button:hover:not(:disabled) { background: var(--bg-elevated); border-color: var(--primary-500); }
        .send-code-button:disabled { opacity: 0.6; cursor: not-allowed; color: var(--text-muted); }
        @media (max-width: 640px) {
          .profile-page { padding: 1rem; }
          .profile-container { padding-top: 4rem; }
          .profile-header { padding: 1.5rem 1.25rem 1rem; }
          .avatar-section { flex-direction: column; text-align: center; }
          .tabs-container { margin: 1rem 1.25rem 0; }
          .tab-button { padding: 0.625rem 0.5rem; font-size: 0.8125rem; }
          .tab-button span { display: none; }
          .alert { margin: 1rem 1.25rem 0; }
          .content-area { padding: 1.25rem; }
          .info-grid { grid-template-columns: 1fr; }
          .back-button { top: 1rem; left: 1rem; }
        }
      `}</style>
    </div>
  );
};

export default Profile;
