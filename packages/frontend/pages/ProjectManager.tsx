import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { mockApi } from '../services/api';

export const ProjectManager = () => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    // Load projects
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">项目管理</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Project cards will be rendered here */}
      </div>
    </div>
  );
};
