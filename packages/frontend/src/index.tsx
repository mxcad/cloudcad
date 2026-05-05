import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import '@/api-sdk';
import { fetchBrandConfig } from './constants/appConfig';

// MSW 浏览器 worker：仅在测试环境（VITE_MSW=true）下启动
if (import.meta.env.VITE_MSW === 'true') {
  const startMsw = async () => {
    const { worker } = await import('./test/msw/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
    console.log('[MSW] Mock Service Worker 已启动');
  };
  startMsw();
}

import './styles/transitions.css';
import './styles/theme.css';
import './styles/app.css';
import './styles/icon.css';
import { ThemeProvider } from './contexts/ThemeContext';
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

console.log('[CloudCAD] 开始初始化应用，rootElement:', !!rootElement);

// 应用启动器：先等待 API Client 和 Brand Config 初始化完成，再渲染应用
const AppInitializer: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[CloudCAD] 开始初始化 Brand Config');
    // API 客户端已通过 @/api-sdk 的 side-effect import 自动配置
    fetchBrandConfig()
      .then((brandConfig) => {
        console.log('[CloudCAD] 初始化成功:', { brandConfig });
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[CloudCAD] 初始化失败:', err);
        setInitError(err instanceof Error ? err.message : String(err));
        // 即使失败也继续渲染，让应用使用默认配置
        setIsReady(true);
      });
  }, []);

  if (!isReady) {
    console.log('[CloudCAD] 初始化中...显示 loading');
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

  console.log('[CloudCAD] 初始化完成，渲染应用');
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(rootElement);
root.render(<AppInitializer />);
