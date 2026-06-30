import React, { useEffect, useReducer, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

import { fetchBrandConfig } from './constants/appConfig';
import { STALE_TIME_DEFAULT, INIT_TIMEOUT } from './constants/timeouts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VoerkaI18nProvider, useVoerkaI18n } from '@voerkai18n/react';
import './languages';


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
import './styles/icon.js';
import './components/drop-indicator/DropIndicator.css';
import { ThemeProvider } from './contexts/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_DEFAULT,
      refetchOnWindowFocus: false,
    },
  },
});
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// 应用启动器：先等待 API Client 和 Brand Config 初始化完成，再渲染应用
const AppInitializer: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { activeLanguage } = useVoerkaI18n();
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    forceUpdate();
  }, [activeLanguage]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      console.warn('[CloudCAD] Brand Config 超时，继续渲染');
      setIsReady(true);
    }, INIT_TIMEOUT);

    fetchBrandConfig()
      .then((brandConfig) => {
        clearTimeout(timeoutId);
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[CloudCAD] 初始化失败:', err);
        clearTimeout(timeoutId);
        setInitError(err instanceof Error ? err.message : String(err));
        // 即使失败也继续渲染，让应用使用默认配置
        setIsReady(true);
      });
  }, []);

  if (!isReady) {
    // 显示一个可见的 loading 状态
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#1e293b',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p>正在加载 CloudCAD...</p>
          {initError && (
            <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
              初始化错误: {initError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
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
  );
};

// 避免 HMR 时重复 createRoot
const root: ReactDOM.Root = ((window as unknown as Record<string, unknown>).__cloudCAD_root as ReactDOM.Root) ?? ReactDOM.createRoot(rootElement);
(window as unknown as Record<string, unknown>).__cloudCAD_root = root;
root.render(
  <VoerkaI18nProvider fallback={null}>
    <AppInitializer />
  </VoerkaI18nProvider>
);
