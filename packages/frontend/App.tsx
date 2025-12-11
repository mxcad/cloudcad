import React from 'react';
import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from 'react-router-dom';
import { Layout } from './components/Layout';
import { AssetLibrary } from './pages/AssetLibrary';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { ProjectManager } from './pages/ProjectManager';
import { Register } from './pages/Register';
import { RoleManagement } from './pages/RoleManagement';
import { UserManagement } from './pages/UserManagement';
import { useAuth } from './contexts/AuthContext';

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* 公开路由 - 不需要 Layout */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 受保护的路由 - 需要 Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/projects" element={<ProjectManager />} />
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
                  <Route path="/fonts" element={<AssetLibrary type="font" />} />
                  <Route
                    path="/fonts/:libraryId"
                    element={<AssetLibrary type="font" />}
                  />

                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/roles" element={<RoleManagement />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
