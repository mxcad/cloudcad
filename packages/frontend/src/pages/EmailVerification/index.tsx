import React, { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getAppBrandConfig } from '@/constants/appConfig';
import { useTheme } from '@/contexts/ThemeContext';
import { t } from '@/languages';
import { RESEND_COOLDOWN_SECONDS } from './constants';
import { useEmailVerificationForm } from './hooks/useEmailVerificationForm';
import { useResendEmail } from './hooks/useResendEmail';
import { SuccessView } from './components/SuccessView';
import { VerificationForm } from './components/VerificationForm';

/**
 * 邮箱验证页面 - CloudCAD
 *
 * 设计特色：
 * - 居中卡片布局
 * - 统一渐变网格背景
 * - 玻璃态效果
 * - 倒计时重发功能
 * - 完美主题适配
 */
export const EmailVerification: React.FC = () => {
  useDocumentTitle(t('邮箱验证'));
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { resendVerification } = useEmailVerification();
  const { isDark } = useTheme();

  // 品牌标题/Logo 走唯一出口：运行时单项键 / 整块 / config.json / 内置默认逐层回落（#499）
  const appName = getAppBrandConfig().title;
  const appLogo = getAppBrandConfig().logo;

  const bindMode = location.state?.mode === 'bind';
  const tempToken = location.state?.tempToken || '';

  const phoneRegisterData = location.state?.phone
    ? {
        phone: location.state.phone,
        code: location.state.code,
        username: location.state.username,
        password: location.state.password,
        nickname: location.state.nickname,
      }
    : null;

  const form = useEmailVerificationForm({
    bindMode,
    tempToken,
    phoneRegisterData,
  });
  const { email, error, success, emailSent, verificationCode, loading } = form;
  const {
    setEmail,
    setError,
    setEmailSent,
    setVerificationCode,
    handleVerifyCode,
  } = form;
  const handleEmailSent = useCallback(() => setEmailSent(true), [setEmailSent]);
  const resend = useResendEmail({
    email,
    onError: setError,
    onEmailSent: handleEmailSent,
  });
  const {
    resendSuccess,
    resendCooldown,
    resendLoading,
    setResendCooldown,
    handleResendEmail,
  } = resend;

  const hasAutoSent = React.useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    const stateEmail = location.state?.email;
    if (stateEmail) {
      setEmail(stateEmail);
      // 注册流程跳来时后端 register() 已发过码（state 带 message 标记）：只标记「已发送」
      // + 进入重发冷却，不再自动重发——否则会与注册那次发送命中同一邮箱的频率限制
      // （email_verification:rate_limit），页面一进来就红框「发送过于频繁」。
      // 登录流程（EMAIL_NOT_VERIFIED，state 仅 email 无 message）才需要页面代发码。
      const codeAlreadySent = Boolean(location.state?.message);
      if (codeAlreadySent) {
        setEmailSent(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else if (location.state?.mode !== 'bind' && !hasAutoSent.current) {
        hasAutoSent.current = true;
        setEmailSent(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        resendVerification({ email: stateEmail }).catch((err) => {
          const errorMessage =
            (err as Error & { response?: { data?: { message?: string } } })
              .response?.data?.message ||
            (err as Error).message ||
            t('发送验证码失败，请手动点击重发');
          setError(errorMessage);
        });
      }
    }
  }, [location, navigate, isAuthenticated]);

  if (success) {
    return <SuccessView isDark={isDark} />;
  }

  return (
    <VerificationForm
      appName={appName}
      appLogo={appLogo}
      isDark={isDark}
      bindMode={bindMode}
      phoneRegisterData={phoneRegisterData}
      emailSent={emailSent}
      email={email}
      error={error}
      resendSuccess={resendSuccess}
      verificationCode={verificationCode}
      loading={loading}
      resendCooldown={resendCooldown}
      resendLoading={resendLoading}
      onEmailChange={(value) => {
        setEmail(value);
        if (error) setError(null);
      }}
      onCodeChange={(value) => {
        const digits = value.replace(/\D/g, '');
        setVerificationCode(digits);
        if (error) setError(null);
      }}
      onVerify={handleVerifyCode}
      onResend={handleResendEmail}
      onBack={() => navigate('/login')}
    />
  );
};

export default EmailVerification;
