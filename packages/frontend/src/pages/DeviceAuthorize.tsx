///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getCopyrightLine } from '@/constants/appConfig';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { deviceAuthControllerAuthorizeDevice } from '@/api-sdk';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBrandConfig } from '../contexts/BrandContext';
import { useTheme } from '../contexts/ThemeContext';
import { InteractiveBackground } from '../components/InteractiveBackground';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { t, $t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { CheckCircle, AlertCircle, Smartphone, Loader2 } from 'lucide-react';
import type { PageState } from './DeviceAuthorize.types';
import styles from './DeviceAuthorize.module.css';

const CLIENT_DISPLAY: Record<string, { title: string; tagline: string }> = {
  mx_cad_viewer: {
    title: import.meta.env.VITE_APP_CADVIEW_TITLE || 'CAD梦想看图',
    tagline:
      import.meta.env.VITE_APP_CADVIEW_TAGLINE || '专业的 CAD 图纸查看工具',
  },
  mx_cad_editor: {
    title: import.meta.env.VITE_APP_MXCADWEB_TITLE || 'CAD梦想画图',
    tagline: import.meta.env.VITE_APP_MXCADWEB_TAGLINE || '专业 CAD 图纸编辑器',
  },
};

export const DeviceAuthorize: React.FC = () => {
  useDocumentTitle(t('设备授权'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userCode = searchParams.get('user_code');
  const clientId = searchParams.get('client_id') || '';
  const forceLogin = searchParams.get('force_login') === '1';
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { config: brandConfig } = useBrandConfig();
  const { isDark } = useTheme();

  const productInfo = CLIENT_DISPLAY[clientId] || {
    title: brandConfig?.title || 'CloudCAD',
    tagline: '',
  };
  const appName = productInfo.title;
  const appTagline = productInfo.tagline;
  const appLogo = brandConfig?.logo || '/logo.png';

  // 授权成功后的重定向地址（EXE 购买 VIP 场景：授权成功后跳转购买页）。
  // 兼容两种形式：相对路径（/member-center）与完整 URL（https://app.mxdraw.com/member-center）。
  // 只取路径部分作为跳转目标——EXE 配置的域名可能与浏览器实际访问的
  // origin 不一致（生产域名 vs 本地联调），但页面是同一套前端，跳路径安全且不开放重定向。
  const rawRedirect = searchParams.get('redirect') || '';
  let redirectTarget = '';
  if (rawRedirect) {
    try {
      const url = new URL(rawRedirect, window.location.origin);
      redirectTarget = url.pathname + url.search + url.hash;
    } catch {
      redirectTarget = '';
    }
  }

  const [pageState, setPageState] = useState<PageState>('missing_code');
  const [countdown, setCountdown] = useState(5);
  const [errorMessage, setErrorMessage] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoTriggered = useRef(false);
  // 授权流程是否已开始（手动确认 / 倒计时自动触发）。
  // 一旦开始，authLoading/isAuthenticated 抖动不得再重置页面状态，
  // 否则授权失败后会陷入 ready → 自动授权 → 失败 → 重置 的无限循环
  const authorizationAttempted = useRef(false);

  useEffect(() => {
    if (!userCode) {
      setPageState('missing_code');
      return;
    }
    if (authLoading) {
      return;
    }
    if (!isAuthenticated) {
      sessionStorage.setItem('device_auth_user_code', userCode);
      if (clientId) sessionStorage.setItem('device_auth_client_id', clientId);
      if (redirectTarget)
        sessionStorage.setItem('device_auth_redirect', redirectTarget);
      window.location.href = '/login';
      return;
    }
    if (forceLogin) {
      sessionStorage.setItem('device_auth_user_code', userCode);
      if (clientId) sessionStorage.setItem('device_auth_client_id', clientId);
      if (redirectTarget)
        sessionStorage.setItem('device_auth_redirect', redirectTarget);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return;
    }
    if (authorizationAttempted.current) {
      return;
    }
    setPageState('ready');
    setCountdown(5);
    hasAutoTriggered.current = false;
  }, [userCode, clientId, forceLogin, isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (pageState !== 'ready') {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          if (!hasAutoTriggered.current) {
            hasAutoTriggered.current = true;
            setPageState('authorizing');
            handleAuthorize();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [pageState]);

  const handleAuthorize = async () => {
    if (!userCode) return;
    authorizationAttempted.current = true;
    setPageState('authorizing');
    try {
      const result = await deviceAuthControllerAuthorizeDevice({
        body: { user_code: userCode },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须抛出才能进入下方错误分支
      if (result.error) throw result.error;
      if (result.data?.success) {
        // EXE 场景：授权成功后跳转重定向地址（如 VIP 购买页），EXE 轮询 token 不受影响
        if (redirectTarget) {
          window.location.href = redirectTarget;
          return;
        }
        setPageState('success');
      } else {
        setErrorMessage(t('授权失败，请重试'));
        setPageState('error');
      }
    } catch (err: unknown) {
      // 登录态已失效（token 无效/过期）→ 保存授权待办并跳转登录页，
      // 避免停留在失败页反复刷新重试
      if ((err as { status?: number })?.status === 401) {
        sessionStorage.setItem('device_auth_user_code', userCode);
        if (clientId) sessionStorage.setItem('device_auth_client_id', clientId);
        if (redirectTarget)
          sessionStorage.setItem('device_auth_redirect', redirectTarget);
        window.location.href = '/login';
        return;
      }
      const message = getErrorMessage(err) || t('授权请求失败');
      if (
        message.includes('not in PENDING state') ||
        message.includes('Invalid or expired')
      ) {
        setErrorMessage(t('授权码已过期或无效'));
      } else {
        setErrorMessage(message);
      }
      setPageState('error');
    }
  };

  const renderMissingCode = () => (
    <div className={styles.authCard}>
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
      </div>
      <div className={styles.supportContent}>
        <div className={`${styles.supportIcon} ${styles.supportIconBg}`}>
          <AlertCircle size={28} />
        </div>
        <h2 className={styles.supportTitle}>{t('缺少授权码')}</h2>
        <p className={styles.supportSubtitle}>
          {t('请从桌面端应用获取授权码后重试')}
        </p>
      </div>
    </div>
  );

  const renderReady = () => (
    <div className={styles.authCard}>
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
        {appTagline && <p className={styles.appTagline}>{appTagline}</p>}
      </div>
      <div className={styles.deviceContent}>
        <div className={styles.deviceIconWrap}>
          <Smartphone size={32} />
        </div>
        <h2 className={styles.deviceTitle}>{appName}</h2>
        <p className={styles.deviceSubtitle}>
          {t('请在下方确认授权码，允许桌面端应用登录您的账号')}
        </p>

        <div className={styles.codeDisplay}>
          <span className={styles.codeText}>{userCode}</span>
        </div>

        <div className={styles.countdownBar}>
          <div className={styles.countdownProgress}>
            <div
              className={styles.countdownFill}
              style={{ width: `${(countdown / 5) * 100}%` }}
            />
          </div>
          <span className={styles.countdownLabel}>
            {$t('{countdown}秒后自动授权', { countdown: String(countdown) })}
          </span>
        </div>

        <div className={styles.deviceActions}>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={pageState === 'authorizing'}
            onClick={handleAuthorize}
          >
            {t('确认授权')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => navigate('/')}
          >
            {t('取消')}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className={styles.authCard}>
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
      </div>
      <div className={styles.successContent}>
        <div className={`${styles.successIcon} ${styles.successIconBg}`}>
          <CheckCircle size={32} />
        </div>
        <h2 className={styles.successTitle}>{t('授权成功')}</h2>
        <p className={styles.successSubtitle}>
          {t('桌面端应用已成功获取登录权限，您可以关闭此页面')}
        </p>
      </div>
    </div>
  );

  const renderError = () => (
    <div className={styles.authCard}>
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
      </div>
      <div className={styles.supportContent}>
        <div className={`${styles.supportIcon} ${styles.errorIconBg}`}>
          <AlertCircle size={28} />
        </div>
        <h2 className={styles.supportTitle}>{t('授权失败')}</h2>
        <p className={styles.supportSubtitle}>{errorMessage}</p>
      </div>
    </div>
  );

  const renderAuthorizing = () => (
    <div className={styles.authCard}>
      <div className={styles.logoSection}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <img src={appLogo} alt={appName} className={styles.logoImage} />
        </div>
        <h1 className={styles.appTitle}>{appName}</h1>
      </div>
      <div className={styles.deviceContent}>
        <div className={styles.deviceIconWrap}>
          <Loader2 size={32} className={styles.spinIcon} />
        </div>
        <h2 className={styles.deviceTitle}>{t('授权中...')}</h2>
        <p className={styles.deviceSubtitle}>{t('正在处理您的授权请求')}</p>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (pageState) {
      case 'missing_code':
        return renderMissingCode();
      case 'ready':
        return renderReady();
      case 'authorizing':
        return renderAuthorizing();
      case 'success':
        return renderSuccess();
      case 'error':
        return renderError();
      default:
        return renderMissingCode();
    }
  };

  return (
    <div className={styles.authPage} data-theme={isDark ? 'dark' : 'light'}>
      <InteractiveBackground />
      <div
        className={styles.themeToggleWrapper}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className={styles.authContainer}>
        {renderPage()}
        <p className={styles.copyright}>{getCopyrightLine(appName)}</p>
      </div>
    </div>
  );
};

export default DeviceAuthorize;
