import React from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Layout } from './components/Layout';

import { CADEditorDirect } from './pages/CADEditorDirect';
import { Dashboard } from './pages/Dashboard';
import { EmailVerification } from './pages/EmailVerification';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Profile } from './pages/Profile';
import { FileSystemManager } from './pages/FileSystemManager';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { RoleManagement } from './pages/RoleManagement';
import { UserManagement } from './pages/UserManagement';
import FontLibrary from './pages/FontLibrary';
import { AuditLogPage } from './pages/AuditLogPage';
import { SystemMonitorPage } from './pages/SystemMonitorPage';
import { RuntimeConfigPage } from './pages/RuntimeConfigPage';
import { useAuth } from './contexts/AuthContext';
import { RuntimeConfigProvider } from './contexts/RuntimeConfigContext';
import { TourProvider } from './contexts/TourContext';
import { usePermission } from './hooks/usePermission';
import { SystemPermission } from './constants/permissions';

// 受保护的路由组件（认证检查）
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = React.memo(
  ({ children }) => {
    const { isAuthenticated, loading, user, token } = useAuth();
    const location = useLocation();

    // 如果已经有 token 或 user 信息，直接显示内容，避免闪烁
    const shouldShowContent = token || user;

    if (loading && !shouldShowContent) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-lg text-slate-600">加载中...</div>
        </div>
      );
    }

    if (!isAuthenticated && !loading) {
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

function AppContent() {
  return (
    <div className="layout-container">
      {/* 全局 CAD 编辑器覆盖层 - 监听路由变化自动显示/隐藏 */}
      <CADEditorDirect />

      <Routes>
        {/* 公开路由 - 不需要 Layout */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<EmailVerification />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* CAD 编辑器路由 - 仅用于 URL 导航，实际渲染由全局覆盖层处理 */}
        {/* 当用户直接访问 /cad-editor/:fileId 时，需要重定向到受保护的路由 */}
        <Route
          path="/cad-editor"
          element={
            <ProtectedRoute>
              <Navigate to="/projects" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cad-editor/:fileId"
          element={
            <ProtectedRoute>
              <div />
            </ProtectedRoute>
          }
        />

        {/* 受保护的路由 - 需要 Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route
                                    path="/"
                                    element={<Navigate to="/dashboard" replace />}
                                  />
                                    <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/recent" element={<Navigate to="/projects" replace />} />
                  <Route path="/favorites" element={<Navigate to="/projects" replace />} />

                  {/* 项目管理和我的图纸 - 使用 FileSystemManager */}
                  <Route path="/projects" element={<FileSystemManager />} />
                  <Route
                    path="/projects/:projectId/files"
                    element={<FileSystemManager />}
                  />
                  <Route
                    path="/projects/:projectId/files/:nodeId"
                    element={<FileSystemManager />}
                  />

                  {/* 私人空间 */}
                  <Route
                    path="/personal-space"
                    element={<FileSystemManager mode="personal-space" />}
                  />
                  <Route
                    path="/personal-space/:nodeId"
                    element={<FileSystemManager mode="personal-space" />}
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
                        <UserManagement />
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
                        <RoleManagement />
                      </PermissionRoute>
                    }
                  />

                  <Route path="/profile" element={<Profile />} />

                  {/* 字体库 - 需要 SYSTEM_FONT_READ 权限 */}
                  <Route
                    path="/font-library"
                    element={
                      <PermissionRoute
                        permission={SystemPermission.SYSTEM_FONT_READ}
                      >
                        <FontLibrary />
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
                        <AuditLogPage />
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
                        <SystemMonitorPage />
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
                        <RuntimeConfigPage />
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

function App() {
  return (
    <Router>
      <RuntimeConfigProvider>
        <TourProvider>
          <AppContent />
        </TourProvider>
      </RuntimeConfigProvider>
    </Router>
  );
}

export default App;
