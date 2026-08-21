import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useBrandConfig } from '../../contexts/BrandContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterForm } from './hooks/useRegisterForm';
import { usePhoneVerification } from './hooks/usePhoneVerification';
import { t } from '@/languages';
import { RegisterLayout } from './RegisterLayout';
import { RegisterClosed } from './RegisterClosed';
import { RegisterBrand } from './RegisterBrand';
import { RegisterSteps } from './RegisterSteps';
import { BasicInfoStep } from './BasicInfoStep';
import { PasswordStep } from './PasswordStep';
import { RegisterFooter } from './RegisterFooter';
import styles from './register.module.css';

export const Register: React.FC = () => {
  useDocumentTitle(t('注册'));
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { config: runtimeConfig, loading: configLoading } = useRuntimeConfig();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';
  const mailEnabled = runtimeConfig.mailEnabled;
  const requireEmailVerification =
    runtimeConfig.requireEmailVerification ?? false;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const requirePhoneVerification =
    runtimeConfig.requirePhoneVerification ?? false;

  // 获取微信临时 Token（如果存在）
  // 如果不是通过微信注册入口进入（URL 无 wechat=1），清除可能残留的过期 Token
  const searchParams = new URLSearchParams(location.search);
  const isWechatEntry = searchParams.get('wechat') === '1';
  if (!isWechatEntry) {
    sessionStorage.removeItem('wechatTempToken');
  }
  const wechatTempToken = sessionStorage.getItem('wechatTempToken');
  const isWechatRegister = !!wechatTempToken;

  // ── Form hooks ──────────────────────────────────
  const {
    register,
    watch,
    currentStep,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    focusedField,
    setFocusedField,
    loading,
    error,
    fieldErrors,
    setExternalErrors,
    handleNext,
    handleBack,
    handleFormSubmit,
  } = useRegisterForm({
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    isWechatRegister,
  });

  const {
    phoneForm,
    setPhoneForm,
    countdown,
    sendingCode,
    handlePhoneChange,
    handleSendCode,
  } = usePhoneVerification({ setFieldErrors: setExternalErrors });

  // Watch password for strength indicator
  const passwordValue = watch('password');

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // 检查是否有预填信息（从登录页跳转过来）
  useEffect(() => {
    const state = location.state as {
      prefillPhone?: string;
      prefillCode?: string;
    } | null;
    if (state?.prefillPhone) {
      setPhoneForm({
        phone: state.prefillPhone,
        code: state.prefillCode || '',
      });
      // 清除 state，避免刷新后重复填充
      window.history.replaceState(null, '');
    }
  }, [location.state, setPhoneForm]);

  // 检查注册开关
  if (!configLoading && !runtimeConfig.allowRegister) {
    return (
      <RegisterLayout
        appName={appName}
        isDark={isDark}
        withBackground={false}
        withLanguageSwitcher
      >
        <RegisterClosed />
      </RegisterLayout>
    );
  }

  // Wrap handleNext to pass phoneForm
  const onNext = () => handleNext(phoneForm);

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
      { label: t('太弱'), color: '#ef4444' },
      { label: t('较弱'), color: '#f97316' },
      { label: t('一般'), color: '#eab308' },
      { label: t('较强'), color: '#22c55e' },
      { label: t('很强'), color: '#10b981' },
    ];
    const level = levels[score] ?? levels[0]!;
    return { strength: score, label: level.label, color: level.color };
  };

  const passwordStrength = getPasswordStrength(passwordValue);

  return (
    <RegisterLayout appName={appName} isDark={isDark} withLanguageSwitcher>
      <div className={styles.registerCard}>
        <RegisterBrand appName={appName} appLogo={appLogo} />

        <RegisterSteps
          currentStep={currentStep}
          formTitle={currentStep === 1 ? t('创建账户') : t('设置密码')}
          formSubtitle={
            currentStep === 1
              ? t('填写您的基本信息')
              : t('设置安全密码以保护账户')
          }
        />

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <AlertCircle size={18} className={styles.alertIcon} />
            <span>{error}</span>
          </div>
        )}

        <form
          className={styles.registerForm}
          onSubmit={(e) => handleFormSubmit(e, phoneForm)}
        >
          {currentStep === 1 ? (
            <BasicInfoStep
              register={register}
              focusedField={focusedField}
              setFocusedField={setFocusedField}
              fieldErrors={fieldErrors}
              mailEnabled={mailEnabled}
              requireEmailVerification={requireEmailVerification}
              smsEnabled={smsEnabled}
              requirePhoneVerification={requirePhoneVerification}
              phoneForm={phoneForm}
              countdown={countdown}
              sendingCode={sendingCode}
              handlePhoneChange={handlePhoneChange}
              handleSendCode={handleSendCode}
              onNext={onNext}
            />
          ) : (
            <PasswordStep
              register={register}
              focusedField={focusedField}
              setFocusedField={setFocusedField}
              fieldErrors={fieldErrors}
              showPassword={showPassword}
              showConfirmPassword={showConfirmPassword}
              setShowPassword={setShowPassword}
              setShowConfirmPassword={setShowConfirmPassword}
              passwordValue={passwordValue}
              passwordStrength={passwordStrength}
              loading={loading}
              onBack={handleBack}
            />
          )}
        </form>

        <RegisterFooter />
      </div>
    </RegisterLayout>
  );
};

export default Register;
