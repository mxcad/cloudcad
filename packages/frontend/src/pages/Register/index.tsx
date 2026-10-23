import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getAppBrandConfig } from '../../constants/appConfig';
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
import { read, erase } from '@/lib/browserStorage';
import styles from './register.module.css';

export const Register: React.FC = () => {
  useDocumentTitle(t('注册'));
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { config: runtimeConfig, loading: configLoading } = useRuntimeConfig();
  const { isDark } = useTheme();

  // 品牌标题/Logo 走唯一出口：运行时单项键 / 整块 / config.json / 内置默认逐层回落（#499）
  const appName = getAppBrandConfig().title;
  const appLogo = getAppBrandConfig().logo;
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
    erase('wechatTempToken', 'session');
  }
  const wechatTempToken = read('wechatTempToken', 'session');
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

  // 注册成功后跳回移动端 URL（window.open 跨域 redirect 模式，与 Login 页对齐）：
  // 移动端经 getPCRegisterUrl(redirect) 打开本页，注册成功自动登录后带 token 跳回，
  // 移动端 extractTokensFromUrl 写入 token 并同步原标签页
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const params = new URLSearchParams(location.search);
      const redirectParam = params.get('redirect');
      if (redirectParam) {
        try {
          const redirectUrl = new URL(redirectParam, window.location.origin);
          if (redirectUrl.origin !== window.location.origin) {
            // 跨域 redirect（移动端 window.open 打开）：带 token 跳回移动端
            const accessToken = read('accessToken');
            if (accessToken) {
              redirectUrl.searchParams.set('accessToken', accessToken);
              const refreshToken = read('refreshToken');
              if (refreshToken) {
                redirectUrl.searchParams.set('refreshToken', refreshToken);
              }
              const user = read('user');
              if (user) {
                redirectUrl.searchParams.set('user', user);
              }
              window.location.href = redirectUrl.toString();
              return;
            }
          } else {
            // 同域 redirect：token 已在共享 localStorage，直接跳回
            navigate(redirectParam, { replace: true });
            return;
          }
        } catch {
          // redirect 不是合法 URL，回退首页
        }
      }
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location.search]);

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
        withLanguageSwitcher
      >
        <RegisterClosed />
      </RegisterLayout>
    );
  }

  // Wrap handleNext to pass phoneForm
  const onNext = () => handleNext(phoneForm);

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
          <div className={`${styles.alert} ${styles.alertError}`} role="alert">
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
