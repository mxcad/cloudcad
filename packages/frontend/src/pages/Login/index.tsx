///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useBrandConfig } from '@/contexts/BrandContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { Tab, Tabs, Button } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { CheckCircle, AlertCircle, Cpu, Boxes, ShieldCheck, Mail, Phone } from 'lucide-react';
import { useLoginForm } from './hooks/useLoginForm';
import { classifyWechatAuthResult } from '@/utils/wechat-auth-result';
import { getReturnUrl } from '@/config/clientSetup';
import { setAccessToken, setRefreshToken } from '@/utils/tokenUtils';
import { t } from '@/languages';
import { loginStyles } from './LoginStyles';
import { LoginHeader } from './components/LoginHeader';
import { AccountLoginForm } from './components/AccountLoginForm';
import { PhoneLoginForm } from './components/PhoneLoginForm';
import { SupportModal } from './components/SupportModal';
import { WechatLoginButton } from './components/WechatLoginButton';
import type { LoginTab } from './hooks/useLoginForm';

interface LocationState {
  from?: string;
  message?: string;
}

/**
 * 登录页面 - CloudCAD
 *
 * 装配层：组装子组件并使用 useLoginForm hook 管理所有状态和业务逻辑。
 */
export const Login: React.FC = () => {
  useDocumentTitle(t('登录'));
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const { config } = useBrandConfig();
  const { config: runtimeConfig } = useRuntimeConfig();
  const appName = config?.title || 'CloudCAD';
  const appLogo = config?.logo || '/logo.png';

  const form = useLoginForm();

  const smsEnabled = runtimeConfig?.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig?.wechatEnabled ?? false;
  const wechatAutoRegister = runtimeConfig?.wechatAutoRegister ?? false;

  // 处理微信登录回调 Hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('wechat_result')) {
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (hashValue) {
          const result = JSON.parse(decodeURIComponent(hashValue));
          window.history.replaceState(null, '', window.location.pathname);

          const isPopup = result.isPopup === true;
          if (isPopup) {
            localStorage.setItem('wechat_auth_result', JSON.stringify(result));
            window.close();
          } else {
            const action = classifyWechatAuthResult(result);
            if (action?.type === 'error') {
              form.setError(`${t('微信登录失败')}：${action.message}`);
            } else if (action?.type === 'need_register') {
              sessionStorage.setItem('wechatTempToken', action.tempToken);
              // 自动注册已开启但后端仍返回 needRegister → 被 allowRegister 等策略阻断
              // 通过路由 state 传递错误信息，避免 form.setError 在 navigate 后不可见
              navigate('/register?wechat=1', {
                state: wechatAutoRegister
                  ? { message: t('微信自动注册失败，请手动完成注册') }
                  : undefined,
              });
            } else if (action?.type === 'bind_email') {
              sessionStorage.setItem('wechatTempToken', action.tempToken);
              navigate('/verify-email', {
                state: { tempToken: action.tempToken, mode: 'bind' },
              });
            } else if (action?.type === 'bind_phone') {
              sessionStorage.setItem('wechatTempToken', action.tempToken);
              navigate('/verify-phone', {
                state: { tempToken: action.tempToken, mode: 'bind' },
              });
            } else if (action?.type === 'login') {
              setAccessToken(action.accessToken);
              setRefreshToken(action.refreshToken);
              localStorage.setItem('user', JSON.stringify(action.user));
              // 使用 returnUrl 替代硬编码 '/'，支持登录后跳回原页面
              const returnUrl = getReturnUrl();
              window.location.href = returnUrl;
            }
          }
        }
      } catch (e) {
        // handleError would be used in production; here the original behavior is preserved
      }
    }
  }, [navigate]);

  // 已登录重定向
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.message) {
      form.setSuccess(state.message);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      // 优先使用 session 中保存的 returnUrl（来自 session 过期），其次使用路由 state.from
      const returnUrl = getReturnUrl();
      const from = (location.state as LocationState)?.from || returnUrl || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location]);

  const handleTabSwitch = (tab: LoginTab) => {
    form.setActiveTab(tab);
    form.setError(null);
    form.setSuccess(null);
  };

  return (
    <div className="login-page" data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div className="theme-toggle-wrapper" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {/* <LanguageSwitcher /> */}
        <ThemeToggle />
      </div>

      <div className="login-container">
        <div className="login-card">
          <LoginHeader appLogo={appLogo} appName={appName} />

          {/* 登录方式 Tab 切换 */}
          {smsEnabled && (
            <Tabs>
              <Tab
                active={form.activeTab === 'account'}
                tabVariant="primary"
                icon={Mail}
                onClick={() => handleTabSwitch('account')}
              >
                {t('账号登录')}
              </Tab>
              <Tab
                active={form.activeTab === 'phone'}
                tabVariant="primary"
                icon={Phone}
                onClick={() => handleTabSwitch('phone')}
              >
                {t('手机登录')}
              </Tab>
            </Tabs>
          )}

          {/* 消息提示 */}
          {form.success && (
            <div className="alert alert-success">
              <CheckCircle size={18} className="alert-icon" />
              <span>{form.success}</span>
            </div>
          )}

          {(form.error || form.authError) && (
            <div className="alert alert-error">
              <AlertCircle size={18} className="alert-icon" />
              <span>{form.error || form.authError}</span>
            </div>
          )}

          {/* 账号登录表单 */}
          {form.activeTab === 'account' && (
            <AccountLoginForm
              formData={form.accountForm.watch()}
              loading={form.loading}
              showPassword={form.showPassword}
              focusedField={form.focusedField}
              getAccountLoginLabel={form.getAccountLoginLabel}
              getAccountLoginPlaceholder={form.getAccountLoginPlaceholder}
              onChange={(e) => form.accountForm.setValue(e.target.name as 'account' | 'password', e.target.value)}
              onFocus={form.setFocusedField}
              onBlur={() => form.setFocusedField(null)}
              onTogglePassword={() => form.setShowPassword(!form.showPassword)}
              onSubmit={form.handleAccountSubmit}
              onForgotPassword={() => navigate('/forgot-password')}
            />
          )}

          {/* 手机登录表单 */}
          {form.activeTab === 'phone' && (
            <PhoneLoginForm
              phoneForm={form.phoneFormHook.watch()}
              loading={form.loading}
              countdown={form.countdown}
              sendingCode={form.sendingCode}
              focusedField={form.focusedField}
              onChange={(e) => form.phoneFormHook.setValue(e.target.name as 'phone' | 'code', e.target.value)}
              onFocus={form.setFocusedField}
              onBlur={() => form.setFocusedField(null)}
              onSendCode={form.handleSendCode}
              onSubmit={form.handlePhoneSubmit}
            />
          )}

          {/* 注册链接 */}
          <div className="form-footer">
            <p className="register-text">
              {t('还没有账户？')}
              <Button variant="secondary" size="xs" onClick={() => navigate('/register')}>
                {t('立即注册')}
              </Button>
            </p>
          </div>

          {/* 微信登录按钮 */}
          {wechatEnabled && (
            <WechatLoginButton onWechatLogin={form.handleWechatLogin} />
          )}

          {/* 特性图标 */}
          <div className="features-bar">
            <div className="feature-dot" data-tooltip={t('高性能 CAD 在线预览')}>
              <Cpu size={14} />
            </div>
            <div className="feature-dot" data-tooltip={t('多用户实时协同编辑')}>
              <Boxes size={14} />
            </div>
            <div className="feature-dot" data-tooltip={t('企业级数据安全保障')}>
              <ShieldCheck size={14} />
            </div>
          </div>
        </div>

        {/* 版权信息 */}
        <p className="copyright">© 2026 {appName}. All rights reserved.</p>
      </div>

      {/* 联系客服弹框 */}
      {form.showSupportModal && (
        <SupportModal onClose={() => form.setShowSupportModal(false)} />
      )}

      <style>{loginStyles}</style>
    </div>
  );
};

export default Login;
