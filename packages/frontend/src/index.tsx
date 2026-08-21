import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { queryClient } from './lib/queryClient';

import { fetchBrandConfig } from './constants/appConfig';
import { INIT_TIMEOUT, STALE_TIME_DEFAULT } from './constants/timeouts';
import { queryKeys } from './lib/queryKeys';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VoerkaI18nProvider } from '@voerkai18n/react';

import './languages';

// Sentry 初始化（仅在配置 VITE_SENTRY_DSN 时启用）
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 1.0,
  });
}

// MSW 浏览器 worker：仅在测试环境（VITE_MSW=true）下启动
if (import.meta.env.VITE_MSW === 'true') {
  const startMsw = async () => {
    const { worker } = await import('./test/msw/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  };
  startMsw();
}

import './styles/transitions.css';
import './styles/theme.css';
import './styles/app.css';
import './styles/calendar.css';
import './styles/icon.js';
import './components/drop-indicator/DropIndicator.css';
import './config/clientSetup';
import { ThemeProvider } from './contexts/ThemeContext';
import { isMobile } from './utils/isMobile';
import {
  getMobileRedirectConfig,
  getMobileRedirectUrl,
} from './utils/mobileRedirect';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// 移动端预检 Promise：在 React 渲染前启动，initApp 中 await 它以确保跳转优先于 mxcad-app 加载
const mobileCheckPromise = isMobile()
  ? getMobileRedirectConfig().then((config) => getMobileRedirectUrl(config))
  : null;

const AppInitializer: React.FC = () => {
  useEffect(() => {
    const initApp = async () => {
      // 1. 初始化 Brand Config
      const timeoutId = setTimeout(() => {
        console.warn('[CloudCAD] Brand Config 超时，继续渲染');
      }, INIT_TIMEOUT);

      try {
        // 预取品牌配置到 react-query 缓存（BrandProvider 直接命中，避免重复请求；ADR-0030）
        await queryClient.fetchQuery({
          queryKey: queryKeys.brand.config,
          queryFn: fetchBrandConfig,
          staleTime: STALE_TIME_DEFAULT,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        console.error('[CloudCAD] 初始化失败:', err);
        clearTimeout(timeoutId);
      }

      // 2. 移动端预检：仅 CAD 编辑器路由 + 移动设备 → 跳转到移动端 H5 编辑器
      if (
        mobileCheckPromise &&
        window.location.pathname.startsWith('/cad-editor')
      ) {
        const redirectUrl = await mobileCheckPromise;
        if (redirectUrl) {
          window.location.replace(redirectUrl);
          return;
        }
      }
    };

    initApp();
  }, []);

  return (
    <VoerkaI18nProvider fallback={null}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <NotificationProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </NotificationProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </VoerkaI18nProvider>
  );
};
// 避免 HMR 时重复 createRoot
const root: ReactDOM.Root =
  ((window as unknown as Record<string, unknown>)
    .__cloudCAD_root as ReactDOM.Root) ?? ReactDOM.createRoot(rootElement);
(window as unknown as Record<string, unknown>).__cloudCAD_root = root;

root.render(<AppInitializer />);
