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
import { ThemeToggle } from '@/components/ThemeToggle';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import { CheckCircle, AlertCircle, Cpu, Boxes, ShieldCheck, Mail, Phone } from 'lucide-react';
import { useLoginForm } from './hooks/useLoginForm';
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
  useDocumentTitle('登录');
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
            if (result.error) {
              alert(`微信登录失败：${result.error}`);
            } else if (result.needRegister) {
              sessionStorage.setItem('wechatTempToken', result.tempToken);
              navigate('/register?wechat=1');
            } else if (result.accessToken) {
              localStorage.setItem('accessToken', result.accessToken);
              localStorage.setItem('refreshToken', result.refreshToken);
              localStorage.setItem('user', JSON.stringify(result.user));
              window.location.href = '/';
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
      const from = (location.state as LocationState)?.from || '/';
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

      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      <div className="login-container">
        <div className="login-card">
          <LoginHeader appLogo={appLogo} appName={appName} />

          {/* 登录方式 Tab 切换 */}
          {smsEnabled && (
            <div className="login-tabs">
              <button
                type="button"
                className={`login-tab ${form.activeTab === 'account' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('account')}
              >
                <Mail size={16} />
                <span>账号登录</span>
              </button>
              <button
                type="button"
                className={`login-tab ${form.activeTab === 'phone' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('phone')}
              >
                <Phone size={16} />
                <span>手机登录</span>
              </button>
            </div>
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
              formData={form.formData}
              loading={form.loading}
              showPassword={form.showPassword}
              focusedField={form.focusedField}
              getAccountLoginLabel={form.getAccountLoginLabel}
              getAccountLoginPlaceholder={form.getAccountLoginPlaceholder}
              onChange={form.handleChange}
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
              phoneForm={form.phoneForm}
              loading={form.loading}
              countdown={form.countdown}
              sendingCode={form.sendingCode}
              focusedField={form.focusedField}
              onChange={form.handlePhoneChange}
              onFocus={form.setFocusedField}
              onBlur={() => form.setFocusedField(null)}
              onSendCode={form.handleSendCode}
              onSubmit={form.handlePhoneSubmit}
            />
          )}

          {/* 注册链接 */}
          <div className="form-footer">
            <p className="register-text">
              还没有账户？
              <button
                onClick={() => navigate('/register')}
                className="register-link"
              >
                立即注册
              </button>
            </p>
          </div>

          {/* 微信登录按钮 */}
          {wechatEnabled && (
            <WechatLoginButton onWechatLogin={form.handleWechatLogin} />
          )}

          {/* 特性图标 */}
          <div className="features-bar">
            <div className="feature-dot" data-tooltip="高性能 CAD 在线预览">
              <Cpu size={14} />
            </div>
            <div className="feature-dot" data-tooltip="多用户实时协同编辑">
              <Boxes size={14} />
            </div>
            <div className="feature-dot" data-tooltip="企业级数据安全保障">
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
