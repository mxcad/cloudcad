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

import React, { Suspense, lazy } from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoadingOverlay } from './components/ui/LoadingOverlay';
import { useAuth } from './contexts/AuthContext';
import { RuntimeConfigProvider } from './contexts/RuntimeConfigContext';
import { TourProvider } from './contexts/TourContext';
import { GlobalTourRenderer } from './components/tour';
import { usePermission } from './hooks/usePermission';
import { SystemPermission } from './constants/permissions';
import { BrandProvider } from './contexts/BrandContext';

// ============================================================================
// 页面懒加载 - 使用 React.lazy 实现代码分割
// ============================================================================

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-primary)' }}>
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--primary-500)' }}
      />
      <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
    </div>
  </div>
);

// 公开页面（认证相关）
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const EmailVerification = lazy(() => import('./pages/EmailVerification'));
const PhoneVerification = lazy(() => import('./pages/PhoneVerification'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// CAD 编辑器（高频使用，单独分包）
const CADEditorDirect = lazy(() => import('./pages/CADEditorDirect'));

// 主要功能页面
const Dashboard = lazy(() => import('./pages/Dashboard'));
const FileSystemManager = lazy(() => import('./pages/FileSystemManager'));
const Profile = lazy(() => import('./pages/Profile'));

// 管理页面（低频使用，按需加载）
const UserManagement = lazy(() => import('./pages/UserManagement'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const FontLibrary = lazy(() => import('./pages/FontLibrary'));
const LibraryManager = lazy(() => import('./pages/LibraryManager'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const SystemMonitorPage = lazy(() => import('./pages/SystemMonitorPage'));
const RuntimeConfigPage = lazy(() => import('./pages/RuntimeConfigPage'));

// ============================================================================
// 路由保护组件
// ============================================================================

// 受保护的路由组件（认证检查）
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = React.memo(
  ({ children }) => {
    const { isAuthenticated, user, token } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
      // 保存当前路径和查询参数到 location state，以便登录后跳转回原页面
      return (
        <Navigate
          to="/login"
          replace
          state={{ from: location.pathname + location.search }}
        />
      );
    }

    return <>{children}</>;
  }
);

// 权限保护路由组件
const PermissionRoute: React.FC<{
  children: React.ReactNode;
  permission: SystemPermission;
}> = React.memo(({ children, permission }) => {
  const { hasPermission } = usePermission();

  if (!hasPermission(permission)) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
});

// 无权限页面提示组件
const NoPermissionPage: React.FC = React.memo(() => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <div className="text-6xl mb-4">🔒</div>
    <h2 className="text-xl font-semibold text-slate-700 mb-2">访问受限</h2>
    <p className="text-slate-500">您没有权限访问此页面</p>
  </div>
));

// ============================================================================
// 应用内容组件
// ============================================================================

function AppContent() {
  return (
    <div className="layout-container">
      {/* 全局加载遮罩 - 覆盖所有内容 */}
      <LoadingOverlay />
      {/* 全局 CAD 编辑器覆盖层 - 监听路由变化自动显示/隐藏 */}
      <CADEditorDirect />

      <Routes>
        {/* 公开路由 - 不需要 Layout */}
        <Route
          path="/login"
          element={
            <Suspense fallback={<PageLoader />}>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/register"
          element={
            <Suspense fallback={<PageLoader />}>
              <Register />
            </Suspense>
          }
        />
        <Route
          path="/verify-email"
          element={
            <Suspense fallback={<PageLoader />}>
              <EmailVerification />
            </Suspense>
          }
        />
        <Route
          path="/verify-phone"
          element={
            <Suspense fallback={<PageLoader />}>
              <PhoneVerification />
            </Suspense>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ForgotPassword />
            </Suspense>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ResetPassword />
            </Suspense>
          }
        />

        {/* 首页重定向到 CAD 编辑器 - 公开访问 */}
        <Route path="/" element={<Navigate to="/cad-editor" replace />} />

        {/* CAD 编辑器路由 - 公开访问，无需登录 */}
        {/* CADEditorDirect 全局覆盖层已在上方渲染，会根据 URL 自动显示/隐藏 */}
        <Route path="/cad-editor" element={<></>} />
        <Route path="/cad-editor/:fileId" element={<></>} />

        {/* 受保护的路由 - 需要 Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="/cad-editor" replace />}
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Dashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/recent"
                    element={<Navigate to="/projects" replace />}
                  />
                  <Route
                    path="/favorites"
                    element={<Navigate to="/projects" replace />}
                  />

                  {/* 项目管理和我的图纸 - 使用 FileSystemManager */}
                  <Route
                    path="/projects"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <FileSystemManager />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/projects/:projectId/files"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <FileSystemManager />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/projects/:projectId/files/:nodeId"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <FileSystemManager />
                      </Suspense>
                    }
                  />

                  {/* 私人空间 */}
                  <Route
                    path="/personal-space"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <FileSystemManager mode="personal-space" />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/personal-space/:nodeId"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <FileSystemManager mode="personal-space" />
                      </Suspense>
                    }
                  />

                  <Route
                    path="/files"
                    element={<Navigate to="/projects" replace />}
                  />

                  {/* 用户管理 - 需要 SYSTEM_USER_READ 权限 */}
                  <Route
                    path="/users"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_USER_READ}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <UserManagement />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  {/* 角色管理 - 需要 SYSTEM_ROLE_READ 权限 */}
                  <Route
                    path="/roles"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_ROLE_READ}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <RoleManagement />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  <Route
                    path="/profile"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Profile />
                      </Suspense>
                    }
                  />

                  {/* 字体库 - 需要 SYSTEM_FONT_READ 权限 */}
                  <Route
                    path="/font-library"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_FONT_READ}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <FontLibrary />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  {/* 公共资源库 - 需要 LIBRARY_DRAWING_MANAGE 或 LIBRARY_BLOCK_MANAGE 权限 */}
                  <Route
                    path="/library"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.LIBRARY_DRAWING_MANAGE}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <LibraryManager />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/library/:libraryType"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.LIBRARY_DRAWING_MANAGE}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <LibraryManager />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="/library/:libraryType/:nodeId"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.LIBRARY_DRAWING_MANAGE}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <LibraryManager />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  {/* 审计日志 - 需要 SYSTEM_ADMIN 权限 */}
                  <Route
                    path="/audit-logs"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_ADMIN}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <AuditLogPage />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  {/* 系统监控 - 需要 SYSTEM_MONITOR 权限 */}
                  <Route
                    path="/system-monitor"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_MONITOR}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <SystemMonitorPage />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />

                  {/* 运行时配置 - 需要 SYSTEM_CONFIG_READ 权限 */}
                  <Route
                    path="/runtime-config"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_CONFIG_READ}
                      >
                        <Suspense fallback={<PageLoader />}>
                          <RuntimeConfigPage />
                        </Suspense>
                      </PermissionRoute>
                    }
                  />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

// ============================================================================
// 主应用组件
// ============================================================================

function App() {
  // 品牌配置已在 index.tsx 的 AppInitializer 中加载并缓存
  // BrandProvider 会使用缓存值，无需在此检查 loading 状态
  return (
    <BrandProvider>
      <Router>
        <RuntimeConfigProvider>
          <TourProvider>
            <AppContent />
            {/* 全局引导渲染 - 使用 Portal 渲染到 body 末尾，确保覆盖所有元素 */}
            <GlobalTourRenderer />
          </TourProvider>
        </RuntimeConfigProvider>
      </Router>
    </BrandProvider>
  );
}

export default App;
