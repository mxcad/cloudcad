import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { mockApi } from '../services/api';

export const FileManager = () => {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    // Load files
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">文件管理</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* File cards will be rendered here */}
      </div>
    </div>
  );
};
