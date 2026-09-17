///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useBrandConfig } from '@/contexts/BrandContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useMembership } from '@/hooks/useMembership';
import {
  getAppBrandConfig,
  getDefaultAppBrandConfig,
  getCopyrightLine,
  type AppBrandConfig,
} from '@/constants/appConfig';
import { Tab, Tabs, Button } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InteractiveBackground } from '@/components/InteractiveBackground';
import {
  CheckCircle,
  AlertCircle,
  Cpu,
  Boxes,
  ShieldCheck,
  Mail,
  Phone,
} from 'lucide-react';
import { useLoginForm } from './hooks/useLoginForm';
import { getReturnUrl } from '@/config/clientSetup';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import { authControllerGetProfile } from '@/api-sdk';
import { t } from '@/languages';
import { QUOTA_GUIDE_EVENT } from '@/utils/quotaUpgradeGuide';
import styles from './Login.module.css';
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
  const {
    isAuthenticated,
    loading: authLoading,
    token,
    setWechatLoginCallbacks,
  } = useAuth();
  const { isDark } = useTheme();
  const { config } = useBrandConfig();
  const { config: runtimeConfig } = useRuntimeConfig();
  // 登录后回来时校验当前账号是否已是会员（判断待办购买意图是否还需要弹出购买弹窗）
  const membership = useMembership();

  // 解析 URL 参数中的应用 ID (如 ?id=cadview)
  const searchParams = new URLSearchParams(location.search);
  const appId = searchParams.get('id')?.toLowerCase() || '';

  // 获取对应应用的品牌配置
  const appBrandConfig: AppBrandConfig = appId
    ? (getAppBrandConfig(appId) ?? getDefaultAppBrandConfig())
    : getDefaultAppBrandConfig();

  const appName = appBrandConfig.title || config?.title || 'CloudCAD';
  const appTagline = appBrandConfig.tagline;
  const appLogo = appBrandConfig.logo || config?.logo || '/logo.png';

  const form = useLoginForm();
  const { setError: setFormError } = form;
  // 稳定引用（useState setter），供 wechat callbacks 注册使用（form 整体每次渲染都是新对象，不能进依赖）
  const { setSuccess: setFormSuccess, setSupportModalVariant, setSupportModalCleanupDays, setShowSupportModal } = form;
  const redirectPerformed = useRef(false);
  const redirectTokenRef = useRef<string | null>(null);

  const smsEnabled = runtimeConfig?.smsEnabled ?? false;
  const wechatEnabled = runtimeConfig?.wechatEnabled ?? false;
  const wechatAutoRegister = runtimeConfig?.wechatAutoRegister ?? false;

  // 微信登录（双实例竞态修复）：AuthContext（Provider）持有 useWechatAuth 的
  // login 唯一处理实例（登录态权威，持有 setToken/setUser）。本页不再注册独立
  // 监听实例，仅注入页面级回调：错误显示（form.setError）、SPA 跳转（navigate）、
  // wechatAutoRegister 提示、注销冷静期恢复/超期回调。卸载时注销，避免全局实例
  // 误处理非登录页结果。
  useEffect(() => {
    setWechatLoginCallbacks({
      onError: (msg) => setFormError(msg),
      wechatAutoRegister,
      navigateTo: (path, opts) => navigate(path, opts),
      // 注销冷静期内自动恢复：登录成功提示后由表单成功消息展示
      onRestored: () => setFormSuccess(t('您的账户已自动恢复，注销已取消')),
      // 注销冷静期已过：弹客服信息弹框（联系客服恢复 + 数据彻底删除告知）
      onDeactivated: (cleanupDays) => {
        setSupportModalVariant('deactivated');
        setSupportModalCleanupDays(cleanupDays || 30);
        setShowSupportModal(true);
      },
    });
    return () => setWechatLoginCallbacks(null);
  }, [
    setWechatLoginCallbacks,
    setFormError,
    wechatAutoRegister,
    navigate,
    setFormSuccess,
    setSupportModalVariant,
    setSupportModalCleanupDays,
    setShowSupportModal,
  ]);

  // 提取桌面端 EXE OAuth 回调参数
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectUri = params.get('redirect_uri');
    if (redirectUri) {
      sessionStorage.setItem('desktop_redirect_uri', redirectUri);
      const state = params.get('state');
      if (state) sessionStorage.setItem('desktop_redirect_state', state);
    }
  }, []);

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
      // token 变化（新登录）时重置跳转标记，避免退出后再次登录不跳转
      if (redirectTokenRef.current !== token) {
        redirectTokenRef.current = token;
        redirectPerformed.current = false;
      }
      if (redirectPerformed.current) return;
      redirectPerformed.current = true;

      // 桌面端 EXE OAuth 回调（优先于普通 redirect）— 验证 token 后同时触发回调 + 页面跳转
      const desktopRedirectUri = sessionStorage.getItem('desktop_redirect_uri');
      if (desktopRedirectUri) {
        if (isAccessTokenExpired()) {
          return;
        }
        authControllerGetProfile()
          .then((res) => {
            if (!res.data) {
              // 验证失败（如 401），不清除 redirect_uri，保留在登录页等待重试
              return;
            }
            // 验证通过，触发 EXE 回调
            const state = sessionStorage.getItem('desktop_redirect_state');
            sessionStorage.removeItem('desktop_redirect_uri');
            sessionStorage.removeItem('desktop_redirect_state');
            const accessToken = localStorage.getItem('accessToken');
            const refreshToken = localStorage.getItem('refreshToken');
            let redirectUrl = desktopRedirectUri;
            let hasQuery = redirectUrl.includes('?');
            if (accessToken) {
              redirectUrl += `${hasQuery ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
              hasQuery = true;
            }
            if (refreshToken)
              redirectUrl += `&refresh_token=${encodeURIComponent(refreshToken)}`;
            if (state) redirectUrl += `&state=${encodeURIComponent(state)}`;
            window.location.href = redirectUrl;
          })
          .catch(() => {});
        return;
      }

      // 检测是否是移动端 window.open 打开的新标签（跨域 redirect 模式）
      const params = new URLSearchParams(window.location.search);
      const redirectParam = params.get('redirect');
      if (redirectParam) {
        try {
          const redirectUrl = new URL(redirectParam);
          if (redirectUrl.origin !== window.location.origin) {
            const accessToken = localStorage.getItem('accessToken');
            if (accessToken) {
              redirectUrl.searchParams.set('accessToken', accessToken);
              const refreshToken = localStorage.getItem('refreshToken');
              if (refreshToken)
                redirectUrl.searchParams.set('refreshToken', refreshToken);
              const user = localStorage.getItem('user');
              if (user) redirectUrl.searchParams.set('user', user);
              window.location.href = redirectUrl.toString();
              return;
            }
          }
        } catch {
          // redirect 不是合法 URL，回退
        }
      }

      // 设备授权待办 — 从 sessionStorage 恢复，优先于普通 redirect
      const deviceUserCode = sessionStorage.getItem('device_auth_user_code');
      if (deviceUserCode) {
        const deviceClientId =
          sessionStorage.getItem('device_auth_client_id') || '';
        const deviceRedirect =
          sessionStorage.getItem('device_auth_redirect') || '';
        sessionStorage.removeItem('device_auth_user_code');
        sessionStorage.removeItem('device_auth_client_id');
        let deviceUrl = `/device?user_code=${encodeURIComponent(deviceUserCode)}${deviceClientId ? `&client_id=${encodeURIComponent(deviceClientId)}` : ''}`;
        if (deviceRedirect) {
          deviceUrl += `&redirect=${encodeURIComponent(deviceRedirect)}`;
        }
        navigate(deviceUrl, { replace: true });
        return;
      }

      // 同域 redirect URL 参数（优先） > sessionStorage > 路由 state.from > '/'
      const returnUrl = getReturnUrl();
      const from =
        redirectParam ||
        returnUrl ||
        (location.state as LocationState)?.from ||
        '/';
      navigate(from, { replace: true });

      // 检测待办 VIP 购买意图（游客使用会员功能时触发，登录后自动弹出购买弹窗）
      const pendingVipPurchase = sessionStorage.getItem('pendingVipPurchase');
      if (pendingVipPurchase) {
        sessionStorage.removeItem('pendingVipPurchase');
        try {
          const reason = JSON.parse(pendingVipPurchase);
          // 回来时先判断当前账号是否已是会员：已是会员则购买意图作废，不再弹窗
          if (membership?.isVip) return;
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent(QUOTA_GUIDE_EVENT, { detail: reason })
            );
          }, 100);
        } catch {
          /* ignore parse error */
        }
      }
    }
  }, [isAuthenticated, authLoading, navigate, location, token, membership?.isVip]);

  const handleTabSwitch = (tab: LoginTab) => {
    form.setActiveTab(tab);
    form.setError(null);
    form.setSuccess(null);
  };

  return (
    <div className={styles.loginPage} data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />

      <div
        className={styles.themeToggleWrapper}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <LoginHeader
            appLogo={appLogo}
            appName={appName}
            appTagline={appTagline}
          />

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
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              <CheckCircle size={18} className={styles.alertIcon} />
              <span>{form.success}</span>
            </div>
          )}

          {(form.error || form.authError) && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <AlertCircle size={18} className={styles.alertIcon} />
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
              onChange={(e) =>
                form.accountForm.setValue(
                  e.target.name as 'account' | 'password',
                  e.target.value
                )
              }
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
              onChange={(e) =>
                form.phoneFormHook.setValue(
                  e.target.name as 'phone' | 'code',
                  e.target.value
                )
              }
              onFocus={form.setFocusedField}
              onBlur={() => form.setFocusedField(null)}
              onSendCode={form.handleSendCode}
              onSubmit={form.handlePhoneSubmit}
            />
          )}

          {/* 注册链接 */}
          <div className={styles.formFooter}>
            <p className={styles.registerText}>
              {t('还没有账户？')}
              <Button
                variant="secondary"
                size="xs"
                onClick={() => navigate('/register')}
              >
                {t('立即注册')}
              </Button>
            </p>
          </div>

          {/* 微信登录按钮 */}
          {wechatEnabled && (
            <WechatLoginButton onWechatLogin={form.handleWechatLogin} />
          )}

          {/* 特性图标 */}
          <div className={styles.featuresBar}>
            <div
              className={styles.featureDot}
              data-testid="feature-dot"
              data-tooltip={t('高性能 CAD 在线预览')}
            >
              <Cpu size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-testid="feature-dot"
              data-tooltip={t('多用户实时协同编辑')}
            >
              <Boxes size={14} />
            </div>
            <div
              className={styles.featureDot}
              data-testid="feature-dot"
              data-tooltip={t('企业级数据安全保障')}
            >
              <ShieldCheck size={14} />
            </div>
          </div>
        </div>

        {/* 版权信息 */}
        <p className={styles.copyright}>
          {getCopyrightLine(appName)} ·{' '}
          <Link to="/privacy" className={styles.legalLink}>
            {t('隐私政策')}
          </Link>{' '}
          ·{' '}
          <Link to="/terms" className={styles.legalLink}>
            {t('用户协议')}
          </Link>
        </p>
      </div>

      {/* 联系客服弹框 */}
      {form.showSupportModal && (
        <SupportModal
          variant={form.supportModalVariant}
          cleanupDays={form.supportModalCleanupDays}
          onClose={() => form.setShowSupportModal(false)}
        />
      )}
    </div>
  );
};

export default Login;
