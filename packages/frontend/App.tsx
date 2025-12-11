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
import { ProjectManager } from './pages/ProjectManager';
import { RoleManagement } from './pages/RoleManagement';
import { UserManagement } from './pages/UserManagement';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectManager />} />
          <Route path="/files" element={<Navigate to="/projects" replace />} />

          {/* Block Library Routes */}
          <Route path="/blocks" element={<AssetLibrary type="block" />} />
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
    </Router>
  );
}

export default App;
