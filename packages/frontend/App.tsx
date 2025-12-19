import React, { useState, useEffect } from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Layout } from './components/Layout';
import { AssetLibrary } from './pages/AssetLibrary';

import { CADEditorDirect } from './pages/CADEditorDirect';
import { EmailVerification } from './pages/EmailVerification';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Profile } from './pages/Profile';
import FileSystemManager from './pages/FileSystemManager';
import { Login } from './pages/Login';
import { ProjectManager } from './pages/ProjectManager';
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

// CAD 编辑器持久化包装组件
const PersistentCADEditor: React.FC = () => {
  const location = useLocation();
  const [cadInitialized, setCadInitialized] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | undefined>();

  const isCADRoute = location.pathname.startsWith('/cad-editor');

  useEffect(() => {
    if (isCADRoute && !cadInitialized) {
      setCadInitialized(true);
    }

    if (isCADRoute) {
      const fileId = location.pathname.split('/')[2];
      setCurrentFileId(fileId);
    }
  }, [location, cadInitialized]);

  if (!cadInitialized) return null;

  return (
    <div style={{ display: isCADRoute ? 'block' : 'none' }}>
      <CADEditorDirect key="persistent-cad-editor" fileUrl={currentFileId} />
    </div>
  );
};

function AppContent() {
  return (
    <div className="layout-container">
      {/* 持久化的 CAD 编辑器 */}
      <PersistentCADEditor />

      <Routes>
          {/* 公开路由 - 不需要 Layout */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* CAD 编辑器路由占位（实际由 PersistentCADEditor 处理） */}
          <Route
            path="/cad-editor"
            element={<ProtectedRoute><div /></ProtectedRoute>}
          />
          <Route
            path="/cad-editor/:fileId"
            element={<ProtectedRoute><div /></ProtectedRoute>}
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
                    <Route path="/projects" element={<ProjectManager />} />
                    {/* 文件系统管理 */}
                    <Route
                      path="/file-system/:projectId"
                      element={<FileSystemManager />}
                    />
                    <Route
                      path="/file-system/:projectId/:nodeId"
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
