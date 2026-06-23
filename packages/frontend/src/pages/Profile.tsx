import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRuntimeConfig } from '../contexts/RuntimeConfigContext';
import { useWechatAuth } from '../hooks/useWechatAuth';
import { usePermission } from '../hooks/usePermission';
import { useNotification } from '../contexts/NotificationContext';
import { usePasswordChange } from './Profile/hooks/usePasswordChange';
import { useEmailBind } from './Profile/hooks/useEmailBind';
import { usePhoneBind } from './Profile/hooks/usePhoneBind';
import { useWechatBind } from './Profile/hooks/useWechatBind';
import { useAccountDeactivate } from './Profile/hooks/useAccountDeactivate';
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
  Check,
  X as XIcon,
} from 'lucide-react';
import { ProfileInfoTab } from './components/ProfileInfoTab';
import { ProfilePasswordTab } from './Profile/ProfilePasswordTab';
import { ProfileEmailTab } from './Profile/ProfileEmailTab';
import { ProfilePhoneTab } from './Profile/ProfilePhoneTab';
import { ProfileWechatTab } from './Profile/ProfileWechatTab';
import { ProfileDeactivateTab } from './components/ProfileDeactivateTab';
import { Button, TabButton, Tabs } from '@/components/ui';
import OrderHistory, { type Order } from '@/components/billing/OrderHistory';
import { type Plan } from '@/components/billing/PricingCard';
import WechatPayButton from '@/components/billing/WechatPayButton';
import PlanSelectOverlay from '@/components/billing/PlanSelectOverlay';
import { Modal } from '@/components/ui/Modal';
import {
  billingControllerGetPlans,
  billingControllerGetMembership,
  billingControllerGetOrders,
  billingControllerCreateOrder,
} from '@/api-sdk';
import './Profile/Profile.css';

type TabType =
  | 'info'
  | 'password'
  | 'email'
  | 'deactivate'
  | 'phone'
  | 'wechat'
  | 'membership';

interface Membership {
  tier: string;
  expiresAt: string | null;
  daysRemaining: number;
}

const FREE_FEATURES: Record<string, number> = {
  maxStorage: 104857600,
  maxProjects: 5,
  maxCollaborators: 0,
  versionHistoryDays: 0,
};

const FEATURE_LABELS: Record<string, string> = {
  maxStorage: '存储空间',
  maxProjects: '项目数量',
  maxCollaborators: '协作者数量',
  versionHistoryDays: '版本历史',
};

const FEATURE_FMT: Record<string, (v: any) => string> = {
  maxStorage: (v) => {
    const gb = (v as number) / 1073741824;
    return gb >= 1024 ? `${(gb / 1024).toFixed(1)}TB` : `${gb.toFixed(0)}GB`;
  },
  maxProjects: (v) => `${v} 个`,
  maxCollaborators: (v) => `${v} 人`,
  versionHistoryDays: (v) => (v === 0 ? '无' : `${v} 天`),
};

const TIER_LABEL: Record<string, string> = {
  FREE: '免费用户',
  PRO: '专业版会员',
  ENTERPRISE: '企业版会员',
};

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, login, refreshUser } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();
  const { isAdmin } = usePermission();
  const { isDark } = useTheme();
  const { showToast, showConfirm } = useNotification();
  const { changePassword } = usePasswordChange();
  const { sendBindCode, verifyBindEmail, sendUnbindCode, verifyUnbindEmail, rebindEmail, unbindEmail } = useEmailBind();
  const { sendSmsCode, sendUnbindPhoneCode, verifyUnbindPhone, bindPhone, rebindPhone, unbindPhone } = usePhoneBind();
  const { bindWechat, unbindWechat } = useWechatBind();
  const { deactivateAccount, resendVerification } = useAccountDeactivate();

  const mailEnabled = runtimeConfig.mailEnabled;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig.wechatEnabled ?? false;

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'membership') return 'membership';
    return 'info';
  });

  useDocumentTitle(
    activeTab === 'membership' ? '会员中心' : '个人资料'
  );

  const visibleTabs: TabType[] = [
    'info',
    'password',
    ...(mailEnabled ? (['email'] as TabType[]) : []),
    ...(smsEnabled ? (['phone'] as TabType[]) : []),
    ...(wechatEnabled ? (['wechat'] as TabType[]) : []),
    'membership',
    'deactivate',
  ];

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
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
    };
  });
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateCountdown, setDeactivateCountdown] = useState(0);

  useEffect(() => {
    if (!deactivateForm.verificationMethod && user) {
      if (user.hasPassword)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'password' }));
      else if (user.phone && (user as Record<string, unknown>).phoneVerified)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'phone' }));
      else if (user.email)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'email' }));
      else if ((user as Record<string, unknown>).wechatId)
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
        const bindRes = await bindWechat({ code: result.code!, state: result.state! });
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

  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [billingLoading, setBillingLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<{
    orderNo: string;
    payParams: Record<string, any> | null;
    codeUrl: string | null;
    redirectUrl: string | null;
    amount: number;
  } | null>(null);

  const [showPlanSelect, setShowPlanSelect] = useState(false);
  const [memSubTab, setMemSubTab] = useState<'compare' | 'orders'>('compare');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderPageRef = useRef(orderPage);
  orderPageRef.current = orderPage;

  const loadBillingData = useCallback(async () => {
    const currentPage = orderPageRef.current;
    try {
      const [planRes, memRes, ordRes]: any = await Promise.all([
        billingControllerGetPlans(),
        billingControllerGetMembership(),
        billingControllerGetOrders({ query: { page: currentPage, limit: 10 } }),
      ]);
      const list = planRes?.data;
      if (Array.isArray(list) && list.length > 0) setPlans(list as Plan[]);
      if (memRes?.data) setMembership(memRes.data as Membership);
      if (ordRes?.data) {
        const data = ordRes.data;
        const items = Array.isArray(data) ? data as Order[] : (data.items ?? []) as Order[];
        setOrders(items);
        if (!Array.isArray(data) && typeof data.total === 'number') {
          setOrderTotal(data.total);
        }
      }
    } catch {
      // billing data is supplementary, don't block the page
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    setBillingLoading(true);
    loadBillingData();
  }, [loadBillingData]);

  // Poll for pending orders when on membership tab (30s interval)
  useEffect(() => {
    if (activeTab !== 'membership') return;
    const id = setInterval(() => { loadBillingData(); }, 30000);
    pollRef.current = id;
    return () => { clearInterval(id); pollRef.current = null; };
  }, [activeTab, loadBillingData]);

  const detectTradeType = (): 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP' => {
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) return 'JSAPI';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'MWEB';
    return 'NATIVE';
  };

  const doCreateOrder = async (planId: string) => {
    const res: any = await billingControllerCreateOrder({
      body: { planId, tradeType: detectTradeType() },
    });
    const orderData = res?.data;
    if (res?.error || !orderData) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建订单失败', type: 'error' } }),
      );
      return null;
    }

    if (orderData.status === 'SUCCEEDED') {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '开通成功！', type: 'success' } }),
      );
      loadBillingData();
      return null;
    }

    if (orderData.status !== 'PENDING' || (!orderData.codeUrl && !orderData.payParams && !orderData.redirectUrl)) {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '获取支付信息失败', type: 'error' } }),
      );
      return null;
    }

    return {
      orderNo: orderData.orderNo,
      payParams: orderData.payParams || null,
      codeUrl: orderData.codeUrl || null,
      redirectUrl: orderData.redirectUrl || null,
      amount: orderData.amount,
    };
  };

  const handlePurchase = async (planId: string) => {
    setPurchasing(planId);
    try {
      const payment = await doCreateOrder(planId);
      if (payment) setPaymentOrder(payment);
    } catch {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '创建订单失败', type: 'error' } }),
      );
    } finally {
      setPurchasing(null);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentOrder(null);
    window.dispatchEvent(
      new CustomEvent('cloudcad:toast', {
        detail: { message: '支付成功！', type: 'success' },
      }),
    );
    loadBillingData();
  };

  const handlePaymentError = (msg: string) => {
    window.dispatchEvent(
      new CustomEvent('cloudcad:toast', {
        detail: { message: msg, type: 'error' },
      }),
    );
  };

  const handleContinuePayment = async (order: Order) => {
    try {
      const payment = await doCreateOrder(order.planId);
      if (payment) setPaymentOrder(payment);
    } catch {
      window.dispatchEvent(
        new CustomEvent('cloudcad:toast', { detail: { message: '获取支付信息失败', type: 'error' } }),
      );
    }
  };

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
    if (countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    countdownRef.current = id;
    return () => {
      clearInterval(id);
      countdownRef.current = null;
    };
  }, [countdown]);

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
      await changePassword({
        oldPassword: user?.hasPassword === false ? undefined : passwordForm.oldPassword,
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
      await sendBindCode({ email: emailForm.email });
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
      await verifyBindEmail({ email: emailForm.email, code: emailForm.code });
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
      const response = await sendUnbindCode();
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
      const response = await verifyUnbindEmail({ code: emailForm.code });
      if (response?.success) {
        setCountdown(0);
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
      await sendBindCode({ email: emailForm.email, isRebind: true });
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
      const response = await rebindEmail({
        email: emailForm.email,
        code: emailForm.code,
        token: emailVerifyToken,
      });
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
      const response = await sendSmsCode({ phone: phoneForm.phone });
      if (response?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        showToast(response?.message || '发送验证码失败', 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败',
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
        setSuccess('验证码已发送到原手机号');
        setCountdown(60);
      } else {
        showToast(response?.message || '发送验证码失败', 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败',
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
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    try {
      const response = await verifyUnbindPhone({ code: phoneForm.code });
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
      const response = await sendSmsCode({ phone: phoneForm.phone });
      if (response?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
        setPhoneStep('verifyNew');
      } else {
        showToast(response?.message || '发送验证码失败', 'error');
      }
    } catch (err) {
      showToast(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败',
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
      const response = await rebindPhone({
        phone: phoneForm.phone,
        code: phoneForm.code,
        token: verifyToken,
      });
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
      const response = await bindPhone({ phone: phoneForm.phone, code: phoneForm.code });
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
      const response = await unbindWechat();
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

  const handleUnbindEmail = async () => {
    const confirmed = await showConfirm({
      title: '解绑邮箱',
      message: '确定要解绑邮箱吗？解绑后将无法通过邮箱找回密码。',
      confirmText: '确认解绑',
      cancelText: '取消',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      setError(null);
      const response = await unbindEmail();
      if (response?.success) {
        showToast('邮箱解绑成功', 'success');
        setSuccess('邮箱解绑成功');
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

  const handleUnbindPhone = async () => {
    const confirmed = await showConfirm({
      title: '解绑手机号',
      message: '确定要解绑手机号吗？解绑后将无法通过手机号登录。',
      confirmText: '确认解绑',
      cancelText: '取消',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      setError(null);
      const response = await unbindPhone();
      if (response?.success) {
        showToast('手机号解绑成功', 'success');
        setSuccess('手机号解绑成功');
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
      await deactivateAccount({
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
      const phone = String(user.phone ?? '');
      await sendSmsCode({ phone });
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
      const email = String(user.email ?? '');
      await resendVerification({ email });
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
    <div className="min-h-screen p-6 profile-page" data-theme={isDark ? 'dark' : 'light'}>
      <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
        返回
      </Button>

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

          <Tabs className="ml-6 mr-6 mt-6">
            <TabButton
              active={activeTab === 'info'}
              icon={User}
              onClick={() => switchTab('info')}
            >
              个人信息
            </TabButton>
            <TabButton
              active={activeTab === 'password'}
              icon={Key}
              onClick={() => switchTab('password')}
            >
              {user?.hasPassword === false ? '设置密码' : '修改密码'}
            </TabButton>
            {mailEnabled && (
              <TabButton
                active={activeTab === 'email'}
                icon={Mail}
                onClick={() => switchTab('email')}
              >
                邮箱绑定
              </TabButton>
            )}
            {smsEnabled && (
              <TabButton
                active={activeTab === 'phone'}
                icon={Phone}
                onClick={() => switchTab('phone')}
              >
                手机绑定
              </TabButton>
            )}
            {wechatEnabled && (
              <TabButton
                active={activeTab === 'wechat'}
                icon={MessageCircle}
                onClick={() => switchTab('wechat')}
              >
                微信绑定
              </TabButton>
            )}
            <TabButton
              active={activeTab === 'membership'}
              icon={Crown}
              onClick={() => switchTab('membership')}
            >
              会员信息
            </TabButton>
            <TabButton
              active={activeTab === 'deactivate'}
              icon={AlertTriangle}
              onClick={() => switchTab('deactivate')}
            >
              注销账户
            </TabButton>
          </Tabs>

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
            {activeTab === 'info' && <ProfileInfoTab user={user} />}

            {activeTab === 'password' && (
              <ProfilePasswordTab
                user={user}
                passwordForm={passwordForm}
                focusedField={focusedField}
                passwordStrength={passwordStrength}
                loading={loading}

                onPasswordChange={handlePasswordChange}
                onPasswordSubmit={handlePasswordSubmit}
                onFocusField={setFocusedField}
                onNavigate={navigate}
              />
            )}

            {activeTab === 'email' && (
              <ProfileEmailTab
                user={user}
                emailForm={emailForm}
                emailStep={emailStep}
                isEditingEmail={isEditingEmail}
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
                onUnbindEmail={handleUnbindEmail}
                onSetEditingEmail={handleSetEditingEmail}
              />
            )}

            {activeTab === 'phone' && smsEnabled && (
              <ProfilePhoneTab
                user={user}
                phoneForm={phoneForm}
                phoneStep={phoneStep}
                isEditingPhone={isEditingPhone}
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
                onUnbindPhone={handleUnbindPhone}
                onFocusField={setFocusedField}
                onSetEditingPhone={setIsEditingPhone}
              />
            )}

            {activeTab === 'wechat' && wechatEnabled && (
              <ProfileWechatTab
                wechatId={user?.wechatId as string | null | undefined}
                loading={loading}

                onBind={wechatBindOpen}
                onUnbind={handleUnbindWechat}
              />
            )}

            {activeTab === 'membership' && (
              <div className="p-6 space-y-6">
                {billingLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent)' }} />
                  </div>
                ) : (
                  <>
                    {/* 会员状态卡片 */}
                    <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Crown size={28} className={(!membership || membership.tier === 'FREE') ? 'text-gray-400' : 'text-yellow-500'} />
                          <div>
                            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {TIER_LABEL[membership?.tier || 'FREE']}
                            </p>
                            {membership && membership.tier !== 'FREE' && membership.expiresAt ? (
                              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                有效期至 {new Date(membership.expiresAt).toLocaleDateString('zh-CN')}
                                {membership.daysRemaining > 0 && `（剩余 ${membership.daysRemaining} 天）`}
                              </p>
                            ) : (
                              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>开通会员解锁更多功能</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant={(!membership || membership.tier === 'FREE') ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setShowPlanSelect(true)}
                        >
                          {(!membership || membership.tier === 'FREE') ? '开通会员' : '续费'}
                        </Button>
                      </div>
                      {membership && membership.tier !== 'FREE' && membership.daysRemaining > 0 && membership.daysRemaining <= 7 && (
                        <div className="flex items-center gap-2 p-3 rounded-lg mt-3" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                          <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                          <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>您的会员将在 <strong>{membership.daysRemaining}</strong> 天后到期，请及时续费</span>
                          <Button variant="outline" size="sm" onClick={() => setShowPlanSelect(true)}>立即续费</Button>
                        </div>
                      )}
                    </div>

                    {/* 待支付提醒 */}
                    {orders.some((o) => o.status === 'PENDING') && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                        <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                        <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>您有待支付的订单，请尽快完成支付</span>
                      </div>
                    )}

                    {/* 子 tab：功能对比 | 购买记录 */}
                    <div className="flex gap-4 border-b pb-3" style={{ borderColor: 'var(--border-default)' }}>
                      <button
                        className="text-sm font-medium pb-1 transition-colors"
                        style={{
                          color: memSubTab === 'compare' ? 'var(--accent-600)' : 'var(--text-secondary)',
                          borderBottom: memSubTab === 'compare' ? '2px solid var(--accent-600)' : '2px solid transparent',
                        }}
                        onClick={() => setMemSubTab('compare')}
                      >
                        功能对比
                      </button>
                      <button
                        className="text-sm font-medium pb-1 transition-colors"
                        style={{
                          color: memSubTab === 'orders' ? 'var(--accent-600)' : 'var(--text-secondary)',
                          borderBottom: memSubTab === 'orders' ? '2px solid var(--accent-600)' : '2px solid transparent',
                        }}
                        onClick={() => setMemSubTab('orders')}
                      >
                        购买记录
                      </button>
                    </div>

                    {/* 功能对比 */}
                    {memSubTab === 'compare' && plans.length > 0 && (
                      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-default)' }}>
                        <table className="w-full text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                              <th className="text-left px-4 py-3 font-semibold text-text-primary">功能</th>
                              <th className="text-center px-4 py-3 font-semibold text-text-primary">免费</th>
                              {plans.map((p) => (
                                <th key={p.id} className="text-center px-4 py-3 font-semibold text-text-primary">
                                  {p.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(['maxStorage', 'maxProjects', 'maxCollaborators', 'versionHistoryDays'] as const).map((key) => (
                              <tr key={key} style={{ borderTop: '1px solid var(--border-default)' }}>
                                <td className="px-4 py-3 text-text-primary">{FEATURE_LABELS[key]}</td>
                                <td className="text-center px-4 py-3">{FEATURE_FMT[key]!(FREE_FEATURES[key])}</td>
                                {plans.map((p) => (
                                  <td key={p.id} className="text-center px-4 py-3" style={{ color: 'var(--success-500)' }}>
                                    {p.features ? FEATURE_FMT[key]!(p.features[key]) : '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                              <td className="px-4 py-3 text-text-primary">协作用户管理</td>
                              <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                              {plans.map((p) => (
                                <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                              ))}
                            </tr>
                            <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                              <td className="px-4 py-3 text-text-primary">版本历史管理</td>
                              <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                              {plans.map((p) => (
                                <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                              ))}
                            </tr>
                            <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                              <td className="px-4 py-3 text-text-primary">高级 API 调用</td>
                              <td className="text-center px-4 py-3"><XIcon size={16} className="inline" style={{ color: 'var(--error-500)' }} /></td>
                              {plans.map((p) => (
                                <td key={p.id} className="text-center px-4 py-3"><Check size={16} className="inline" style={{ color: 'var(--success-500)' }} /></td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 购买记录 */}
                    {memSubTab === 'orders' && (
                      <OrderHistory
                        orders={orders}
                        loading={billingLoading}
                        onRefresh={loadBillingData}
                        onContinuePayment={handleContinuePayment}
                        page={orderPage}
                        total={orderTotal}
                        onPageChange={(p) => setOrderPage(p)}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'deactivate' && (
              <ProfileDeactivateTab
                user={user}
                deactivateForm={deactivateForm}
                deactivateLoading={deactivateLoading}
                deactivateCountdown={deactivateCountdown}
                loading={loading}
                onVerificationMethodChange={(method: '' | 'password' | 'phone' | 'email' | 'wechat') =>
                  setDeactivateForm((f) => ({
                    ...f,
                    verificationMethod: method,
                    password: '',
                    phoneCode: '',
                    emailCode: '',
                    wechatConfirm: '',
                  }))
                }
                onPasswordChange={(password: string) =>
                  setDeactivateForm((f) => ({ ...f, password }))
                }
                onPhoneCodeChange={(phoneCode: string) =>
                  setDeactivateForm((f) => ({ ...f, phoneCode }))
                }
                onEmailCodeChange={(emailCode: string) =>
                  setDeactivateForm((f) => ({ ...f, emailCode }))
                }
                onConfirmedChange={(confirmed: boolean) =>
                  setDeactivateForm((f) => ({ ...f, confirmed }))
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
                onShowConfirm={showConfirm}
                onLogout={logout}
              />
            )}
          </div>
        </div>

        {paymentOrder && (
          <Modal
            isOpen={true}
            onClose={() => setPaymentOrder(null)}
            title="订单支付"
            size="sm"
          >
            <WechatPayButton
              orderNo={paymentOrder.orderNo}
              payParams={paymentOrder.payParams}
              codeUrl={paymentOrder.codeUrl}
              redirectUrl={paymentOrder.redirectUrl}
              amount={paymentOrder.amount}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onClose={() => setPaymentOrder(null)}
            />
          </Modal>
        )}

        <PlanSelectOverlay
          open={showPlanSelect}
          plans={plans}
          purchasing={purchasing}
          isAuthenticated={!!user}
          onPurchase={(planId) => handlePurchase(planId)}
          onClose={() => setShowPlanSelect(false)}
        />
      </div>
      </div>
  );
};

export default Profile;
