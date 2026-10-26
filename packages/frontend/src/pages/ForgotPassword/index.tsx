import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSupportContact } from '@/hooks/useSupportContact';
import { getAppBrandConfig } from '@/constants/appConfig';
import { useTheme } from '@/contexts/ThemeContext';
import { t } from '@/languages';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from './forgotPasswordSchema';
import { useForgotPassword } from './useForgotPassword';
import { NoChannelView } from './components/NoChannelView';
import { SupportView } from './components/SupportView';
import { SuccessView } from './components/SuccessView';
import { ForgotFormView } from './components/ForgotFormView';
import { SupportModal } from './components/SupportModal';

/**
 * 忘记密码页面 - CloudCAD
 *
 * 设计特色
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 多种状态页面（表单/成功/客服联系）
 * - 支持邮箱/手机号两种方式
 * - 完美主题适配
 */
export const ForgotPassword: React.FC = () => {
  useDocumentTitle(t('忘记密码'));
  const navigate = useNavigate();
  const { config: runtimeConfig } = useRuntimeConfig();
  const supportContact = useSupportContact();
  const { isDark } = useTheme();

  // 品牌标题/Logo 走唯一出口：运行时单项键 / 整块 / config.json / 内置默认逐层回落（#499）
  const appName = getAppBrandConfig().title;
  const appLogo = getAppBrandConfig().logo;

  const mailAvailable = runtimeConfig.mailEnabled;
  const phoneAvailable = runtimeConfig.smsEnabled;
  const noChannelAvailable = !mailAvailable && !phoneAvailable;

  const [contactType, setContactType] = useState<'email' | 'phone'>(
    mailAvailable ? 'email' : 'phone'
  );
  const forgotPassword = useForgotPassword();
  const [success, setSuccess] = useState(false);
  const [successContact, setSuccessContact] = useState('');
  const [supportInfo, setSupportInfo] = useState<{
    supportEmail?: string;
    supportPhone?: string;
  } | null>(null);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const {
    register,
    handleSubmit: rhfSubmit,
    setValue,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      contactType: 'email',
      email: '',
      phone: '',
    },
  });

  // 客户端 zod 校验与服务端错误互斥：客户端拦下时请求根本不会发出，所以两者只会
  // 命中其一。此前只解构了 register/handleSubmit/setValue，校验消息无人读取 ——
  // 空邮箱点「发送验证码」既不报错也不请求，是纯静默失败（实测无提示）。
  // 错误须读 errors.email / errors.phone：schema 用 superRefine 带显式 path，
  // 若改用顶层 .refine()，zodResolver 会把错误放进 key ""，RHF 不映射进
  // formState.errors（实测 errorKeys 为空）——提交被拦下但消息永不可达。
  const clientError =
    errors.email?.message || errors.phone?.message || null;
  const displayError = forgotPassword.error || clientError;

  const onSubmit = async (data: ForgotPasswordValues) => {
    const result = await forgotPassword.submit({
      email: data.contactType === 'email' ? data.email : undefined,
      phone: data.contactType === 'phone' ? data.phone : undefined,
    });

    if (!result) return;

    if (result.mailEnabled === false && result.smsEnabled === false) {
      // 后端未填客服信息时回落品牌/内置默认值，避免 SupportView 空态
      setSupportInfo({
        supportEmail: result.supportEmail || supportContact.email,
        supportPhone: result.supportPhone || supportContact.phone,
      });
    } else {
      setSuccessContact(data.contactType === 'email' ? data.email : data.phone);
      setSuccess(true);
    }
  };

  const switchContactType = (type: 'email' | 'phone') => {
    setContactType(type);
    setValue('contactType', type);
  };

  if (noChannelAvailable) {
    return (
      <NoChannelView
        appName={appName}
        appLogo={appLogo}
        isDark={isDark}
        supportEmail={runtimeConfig.supportEmail || undefined}
        supportPhone={runtimeConfig.supportPhone || undefined}
        onBack={() => navigate('/login')}
      />
    );
  }

  if (supportInfo) {
    return (
      <SupportView
        appName={appName}
        appLogo={appLogo}
        isDark={isDark}
        supportEmail={supportInfo.supportEmail}
        supportPhone={supportInfo.supportPhone}
        onBack={() => navigate('/login')}
      />
    );
  }

  if (success) {
    return (
      <SuccessView
        appName={appName}
        appLogo={appLogo}
        isDark={isDark}
        successContact={successContact}
        contactType={contactType}
        onGoReset={() =>
          navigate('/reset-password', {
            state: {
              email: contactType === 'email' ? successContact : undefined,
              phone: contactType === 'phone' ? successContact : undefined,
            },
          })
        }
        onBack={() => navigate('/login')}
      />
    );
  }

  return (
    <>
      <ForgotFormView
        appName={appName}
        appLogo={appLogo}
        isDark={isDark}
        mailAvailable={mailAvailable}
        phoneAvailable={phoneAvailable}
        contactType={contactType}
        error={displayError}
        loading={forgotPassword.loading}
        register={register}
        handleSubmit={rhfSubmit}
        onSubmit={onSubmit}
        onSwitchContactType={switchContactType}
        onOpenSupportModal={() => setShowSupportModal(true)}
        onBack={() => navigate('/login')}
      />
      <SupportModal
        open={showSupportModal}
        onClose={() => setShowSupportModal(false)}
      />
    </>
  );
};

export default ForgotPassword;
