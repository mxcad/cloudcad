import React, { Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { initApiClient } from './services/apiClient';

import './styles/transitions.css';
import './styles/app.css';
import './styles/icon.css';
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// 全局加载组件
const GlobalLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-sm text-slate-600">CloudCAD 加载中...</div>
    </div>
  </div>
);

// 应用启动器：先初始化 API Client，再渲染应用
const AppInitializer: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initApiClient()
      .then(() => {
        setIsReady(true);
      })
      .catch((err) => {
        console.error('API Client 初始化失败:', err);
        setError('应用初始化失败，请刷新页面重试');
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <div className="text-slate-700">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return <GlobalLoading />;
  }

  return (
    <Suspense fallback={<GlobalLoading />}>
      <NotificationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificationProvider>
    </Suspense>
  );
};

const root = ReactDOM.createRoot(rootElement);
root.render(<AppInitializer />);
