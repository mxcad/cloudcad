import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

import { fetchBrandConfig } from './constants/appConfig';
import { STALE_TIME_DEFAULT, INIT_TIMEOUT } from './constants/timeouts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VoerkaI18nProvider } from '@voerkai18n/react';

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
import { isCADRoute } from './utils/hasRoute';
import { i18nScope } from './languages';

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

// 1. 修复：Load 组件原本缺少 return 语句，这里补全
const Load: React.FC<{ initError: string | null }> = ({ initError }) => {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="animate-spin rounded-full h-8 w-8"
        style={{
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--accent-600)',
        }}
      />
      <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
       loading...
      </p>
    </div>
  );
};

// 2. 核心修改：将 CAD 加载逻辑移入 AppInitializer 内部
const AppInitializer: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      // 1. 初始化 Brand Config
      const timeoutId = setTimeout(() => {
        console.warn('[CloudCAD] Brand Config 超时，继续渲染');
      }, INIT_TIMEOUT);

      try {
        await fetchBrandConfig();
        clearTimeout(timeoutId);
      } catch (err) {
        console.error('[CloudCAD] 初始化失败:', err);
        clearTimeout(timeoutId);
        setInitError(err instanceof Error ? err.message : String(err));
      }

      // 2. 如果是 CAD 路由，必须等待 CAD 模块加载完毕
      if (isCADRoute) {
        try {
          await import('mxcad-app');
        } catch (err) {
          console.error('[CloudCAD] CAD 模块加载失败:', err);
          setInitError('CAD 模块加载失败');
        }
      }

      // 3. 只有当配置加载完，且 CAD 模块（如果需要）也加载完后，才放行
      setIsReady(true);
    };

    initApp();
  }, []);

  // 4. 在 isReady 之前，拦截所有渲染，包括 VoerkaI18nProvider
  if (!isReady) {
    return <Load initError={initError} />;
  }

  // 5. 只有 isReady 为 true 时，才会渲染 VoerkaI18nProvider
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
const root: ReactDOM.Root = ((window as unknown as Record<string, unknown>).__cloudCAD_root as ReactDOM.Root) ?? ReactDOM.createRoot(rootElement);
(window as unknown as Record<string, unknown>).__cloudCAD_root = root;

root.render(
  <AppInitializer />
);