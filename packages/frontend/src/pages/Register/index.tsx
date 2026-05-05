import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { RegistrationClosed } from './RegistrationClosed';
import { RegisterForm } from './components/RegisterForm';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useBrandConfig } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { handleError } from '@/utils/errorHandler';
import './Register.css';

/**
 * Register page — CloudCAD
 * Assembly layer: coordinates config, auth, sub-components.
 *
 * Directory structure:
 *   index.tsx                    (this file — ~120 lines, assembly only)
 *   RegistrationClosed.tsx       (early-return UI when registration is disabled)
 *   components/RegisterForm.tsx   (form layout, step indicator, footer)
 *   hooks/useRegisterForm.ts     (form state + validation + submission)
 *   hooks/usePhoneVerification.ts (phone/SMS state + countdown)
 *   utils/passwordStrength.ts    (pure password scoring function)
 *   Register.css                 (all styles)
 */
export const Register: React.FC = () => {
  useDocumentTitle('注册');
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { config: runtimeConfig, loading: configLoading } = useRuntimeConfig();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const appName = brandConfig?.title || 'CloudCAD';
  const appLogo = brandConfig?.logo || '/logo.png';
  const mailEnabled = runtimeConfig.mailEnabled;
  const requireEmailVerification = runtimeConfig.requireEmailVerification ?? false;
  const smsEnabled = runtimeConfig.smsEnabled ?? false;
  const requirePhoneVerification = runtimeConfig.requirePhoneVerification ?? false;

  // ── WeChat temp token ──
  const searchParams = new URLSearchParams(location.search);
  const isWechatEntry = searchParams.get('wechat') === '1';
  if (!isWechatEntry) {
    sessionStorage.removeItem('wechatTempToken');
  }
  const wechatTempToken = sessionStorage.getItem('wechatTempToken');
  const isWechatRegister = !!wechatTempToken;

  // ── Pre-fill from login redirect ──
  const [prefillPhone, setPrefillPhone] = useState('');
  const [prefillCode, setPrefillCode] = useState('');

  useEffect(() => {
    const state = location.state as {
      prefillPhone?: string;
      prefillCode?: string;
    } | null;
    if (state?.prefillPhone) {
      setPrefillPhone(state.prefillPhone);
      setPrefillCode(state.prefillCode || '');
      window.history.replaceState(null, '');
    }
  }, [location.state]);

  // ── Registration closed ──
  if (!configLoading && !runtimeConfig.allowRegister) {
    return <RegistrationClosed />;
  }

  // ── Already authenticated → redirect ──
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // ── Render ──
  return (
    <div
      className="relative z-[1] register-page"
      data-theme={isDark ? 'dark' : 'light'}
    >
      <InteractiveBackground />
      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>
      <div className="register-container">
        <div className="register-card">
          {/* Logo */}
          <div className="logo-section">
            <div className="logo-wrapper">
              <div className="logo-glow" />
              <img src={appLogo} alt={appName} className="logo-image" />
            </div>
            <h1 className="app-title">{appName}</h1>
            <p className="app-tagline">创建账户，开启云端 CAD 之旅</p>
          </div>

          <RegisterForm
            mailEnabled={mailEnabled}
            requireEmailVerification={requireEmailVerification}
            smsEnabled={smsEnabled}
            requirePhoneVerification={requirePhoneVerification}
            isWechatRegister={isWechatRegister}
            wechatTempToken={wechatTempToken}
            prefillPhone={prefillPhone}
            prefillCode={prefillCode}
          />
        </div>
        <p className="copyright">© 2026 {appName}. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Register;
