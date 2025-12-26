import React from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';
import { Layout } from './components/Layout';
import { AssetLibrary } from './pages/AssetLibrary';

import { CADEditorDirect } from './pages/CADEditorDirect';
import { EmailVerification } from './pages/EmailVerification';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Profile } from './pages/Profile';
import { FileSystemManager } from './pages/FileSystemManager';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { RoleManagement } from './pages/RoleManagement';
import { UserManagement } from './pages/UserManagement';
import { useAuth } from './contexts/AuthContext';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = React.memo(
  ({ children }) => {
    const { isAuthenticated, loading, user, token } = useAuth();

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
      return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
  }
);

function AppContent() {
  return (
    <div className="layout-container">
      <Routes>
          {/* 公开路由 - 不需要 Layout */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* CAD 编辑器路由 */}
          <Route
            path="/cad-editor"
            element={<ProtectedRoute><CADEditorDirect /></ProtectedRoute>}
          />
          <Route
            path="/cad-editor/:fileId"
            element={<ProtectedRoute><CADEditorDirect /></ProtectedRoute>}
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
                      element={<Navigate to="/projects" replace />}
                    />
                    {/* 统一使用 FileSystemManager 组件：项目根目录模式（无 projectId）和文件夹模式（有 projectId） */}
                    <Route path="/projects" element={<FileSystemManager />} />
                    <Route
                      path="/projects/:projectId/files"
                      element={<FileSystemManager />}
                    />
                    <Route
                      path="/projects/:projectId/files/:nodeId"
                      element={<FileSystemManager />}
                    />

                    <Route
                      path="/files"
                      element={<Navigate to="/projects" replace />}
                    />

                    {/* Block Library Routes */}
                    <Route
                      path="/blocks"
                      element={<AssetLibrary type="block" />}
                    />
                    <Route
                      path="/blocks/:libraryId"
                      element={<AssetLibrary type="block" />}
                    />

                    {/* Font Library Routes */}
                    <Route
                      path="/fonts"
                      element={<AssetLibrary type="font" />}
                    />
                    <Route
                      path="/fonts/:libraryId"
                      element={<AssetLibrary type="font" />}
                    />

                    <Route path="/users" element={<UserManagement />} />
                    <Route path="/roles" element={<RoleManagement />} />
                    <Route path="/profile" element={<Profile />} />
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
      <AppContent />
    </Router>
  );
}

export default App;
