import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { setupGlobalAuth } from './utils/globalAuth';

import './styles/transitions.css';
import './styles/app.css';

// 在应用启动时设置全局认证
setupGlobalAuth();

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

const root = ReactDOM.createRoot(rootElement);
root.render(
  <Suspense fallback={<GlobalLoading />}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </Suspense>
);
