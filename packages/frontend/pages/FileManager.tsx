import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderPlus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { filesApi, projectsApi } from '../services/apiService';
import type { components } from '../types/api';

// 类型定义
type FileDto = {
  id: string;
  name: string;
  originalName?: string;
  path: string;
  size: number;
  mimeType: string;
  status: string;
  ownerId: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    username: string;
    nickname?: string;
  };
  project?: {
    id: string;
    name: string;
  };
};

type ProjectDto = {
  id: string;
  name: string;
  description?: string;
};

interface FileAccessDto {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    username: string;
    nickname?: string;
  };
}

const FileManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  
  // 状态管理
  const [files, setFiles] = useState<FileDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>(projectId || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragActive, setDragActive] = useState(false);

  // 文件操作相关状态
  const [showFileModal, setShowFileModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileDto | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [fileAccessList, setFileAccessList] = useState<FileAccessDto[]>([]);
  
  // 创建文件夹相关状态
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');

  // 获取文件列表（使用 file-system API）
  const loadFiles = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await projectsApi.getChildren(projectId);
      const fileData = response.data as any[];
      setFiles(fileData);
    } catch (error) {
      console.error('获取文件列表失败:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 获取项目列表
  const loadProjects = useCallback(async () => {
    try {
      const response = await projectsApi.list();
      setProjects(response.data as ProjectDto[]);
    } catch (error) {
      console.error('获取项目列表失败:', error);
      setProjects([]);
    }
  }, []);

  // 页面加载时获取数据
  useEffect(() => {
    loadFiles();
    loadProjects();
  }, [loadFiles, loadProjects]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 获取文件类型图标
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('dwg') || mimeType.includes('dxf')) return '📐';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    if (mimeType.includes('text')) return '📝';
    return '📎';
  };

  // 文件上传处理
  const handleFileUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileId = Math.random().toString(36).substring(7);
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

        try {
          // 创建FormData
          const formData = new FormData();
          formData.append('file', file);
          if (selectedProject !== 'all') {
            formData.append('projectId', selectedProject);
          }

          const response = await filesApi.upload(file, selectedProject === 'all' ? '' : selectedProject);
          const uploadedFile = response.data as FileDto;

          setFiles(prev => [uploadedFile, ...prev]);
          setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));
          
          // 清除进度
          setTimeout(() => {
            setUploadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[fileId];
              return newProgress;
            });
          }, 1000);

          return uploadedFile;
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
          throw error;
        }
      });

      await Promise.all(uploadPromises);
    } catch (error) {
      console.error('文件上传失败:', error);
    } finally {
      setUploading(false);
    }
  };

  // 拖拽处理
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, []);

  // 文件下载
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await filesApi.download(fileId);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('文件下载失败:', error);
    }
  };

  // 文件删除
  const handleDelete = async (fileId: string) => {
    if (!confirm('确定要删除这个文件吗？')) return;

    try {
      await filesApi.delete(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    } catch (error) {
      console.error('文件删除失败:', error);
    }
  };

  // 文件重命名
  const handleRename = async (fileId: string, newName: string) => {
    try {
      await filesApi.update(fileId, { name: newName });
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName } : f));
    } catch (error) {
      console.error('文件重命名失败:', error);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedFiles.size} 个文件吗？`)) return;

    try {
      await Promise.all(Array.from(selectedFiles).map(fileId => filesApi.delete(fileId)));
      setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('批量删除失败:', error);
    }
  };

  // 获取文件权限
  const handleGetAccess = async (fileId: string) => {
    try {
      const response = await filesApi.getAccess(fileId);
      setFileAccessList(response.data as FileAccessDto[]);
      setShowPermissionModal(true);
    } catch (error) {
      console.error('获取文件权限失败:', error);
    }
  };

  // 分享文件
  const handleShare = async (fileId: string, userId: string, role: string) => {
    try {
      await filesApi.share(fileId, { userId, role });
      setShowShareModal(false);
      alert('文件分享成功');
    } catch (error) {
      console.error('文件分享失败:', error);
    }
  };

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      alert('请输入文件夹名称');
      return;
    }
    
    if (!projectId) {
      alert('请先选择项目');
      return;
    }

    try {
      await projectsApi.createFolder(projectId, { name: folderName.trim() });
      setShowCreateFolderModal(false);
      setFolderName('');
      await loadFiles();
      alert('文件夹创建成功');
    } catch (error) {
      console.error('创建文件夹失败:', error);
      alert('创建文件夹失败');
    }
  };

  // 过滤文件
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         file.originalName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = selectedProject === 'all' || file.projectId === selectedProject;
    return matchesSearch && matchesProject;
  });

  // 文件选择处理
  const handleFileSelect = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* 页面标题 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {projectId && (
            <button
              onClick={() => navigate('/projects')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="返回项目列表"
            >
              <ArrowLeft size={24} className="text-gray-600" />
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900">文件管理</h1>
        </div>
        <p className="text-gray-600">管理和组织您的项目文件</p>
      </div>

      {/* 操作栏 */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* 左侧操作 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 文件上传 */}
            <div className="relative">
              <input
                type="file"
                multiple
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading}
              />
              <Button variant="primary" disabled={uploading}>
                {uploading ? '上传中...' : '上传文件'}
              </Button>
            </div>

            {/* 创建文件夹 */}
            {projectId && (
              <Button 
                variant="outline" 
                onClick={() => setShowCreateFolderModal(true)}
              >
                <FolderPlus size={16} className="mr-2" />
                新建文件夹
              </Button>
            )}

            {/* 批量操作 */}
            {selectedFiles.size > 0 && (
              <Button variant="danger" onClick={handleBatchDelete}>
                删除选中 ({selectedFiles.size})
              </Button>
            )}

            {/* 视图切换 */}
            <div className="flex border rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 text-sm ${
                  viewMode === 'grid' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-600'
                }`}
              >
                网格视图
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 text-sm border-l ${
                  viewMode === 'list' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-600'
                }`}
              >
                列表视图
              </button>
            </div>
          </div>

          {/* 右侧搜索和筛选 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 项目筛选 */}
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">所有项目</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            {/* 搜索框 */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜索文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
              <div className="absolute left-3 top-2.5 text-gray-400">
                🔍
              </div>
            </div>
          </div>
        </div>

        {/* 上传进度 */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mt-4 space-y-2">
            {Object.entries(uploadProgress).map(([fileId, progress]) => (
              <div key={fileId} className="flex items-center gap-2 text-sm">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-gray-600">{progress}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 拖拽上传区域 */}
      {dragActive && (
        <div
          className="fixed inset-0 bg-indigo-500 bg-opacity-20 flex items-center justify-center z-50"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <div className="text-4xl mb-4">📁</div>
            <p className="text-lg font-medium text-gray-900">释放文件到此处上传</p>
          </div>
        </div>
      )}

      {/* 文件列表 */}
      <div className="bg-white rounded-lg shadow-sm">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">加载中...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-4">📄</div>
            <p className="text-gray-600">暂无文件</p>
            <p className="text-sm text-gray-500 mt-1">上传您的第一个文件开始使用</p>
          </div>
        ) : (
          <div className="p-4">
            {/* 全选按钮 */}
            <div className="mb-4 flex items-center">
              <input
                type="checkbox"
                checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                onChange={handleSelectAll}
                className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-600">
                {selectedFiles.size > 0 ? `已选中 ${selectedFiles.size} 个文件` : '全选'}
              </span>
            </div>

            {/* 文件网格/列表 */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                      selectedFiles.has(file.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                    onClick={() => handleFileSelect(file.id)}
                  >
                    {/* 文件图标和名称 */}
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">{getFileIcon(file.mimeType)}</div>
                      <h3 className="text-sm font-medium text-gray-900 truncate" title={file.name}>
                        {file.name}
                      </h3>
                    </div>

                    {/* 文件信息 */}
                    <div className="text-xs text-gray-500 space-y-1">
                      <div>大小: {formatFileSize(file.size)}</div>
                      <div>类型: {file.mimeType.split('/')[1]?.toUpperCase()}</div>
                      {file.project && <div>项目: {file.project.name}</div>}
                      <div>上传: {new Date(file.createdAt).toLocaleDateString()}</div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="mt-3 flex justify-between">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file.id, file.name);
                        }}
                      >
                        下载
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGetAccess(file.id);
                          }}
                        >
                          权限
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.id);
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 列表视图 */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">文件名</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">大小</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">类型</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">项目</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">上传时间</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-900">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map((file) => (
                      <tr
                        key={file.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${
                          selectedFiles.has(file.id) ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.id)}
                            onChange={() => handleFileSelect(file.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <span className="text-xl mr-3">{getFileIcon(file.mimeType)}</span>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{file.name}</div>
                              {file.originalName !== file.name && (
                                <div className="text-xs text-gray-500">{file.originalName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {formatFileSize(file.size)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {file.mimeType.split('/')[1]?.toUpperCase()}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {file.project?.name || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(file.id, file.name)}
                            >
                              下载
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleGetAccess(file.id)}
                            >
                              权限
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(file.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 文件权限管理模态框 */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">文件权限管理</h3>
            <div className="space-y-2 mb-4">
              {fileAccessList.map((access) => (
                <div key={access.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm">{access.user.nickname || access.user.username}</span>
                  <span className="text-xs text-gray-500">{access.role}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPermissionModal(false)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 创建文件夹模态框 */}
      <Modal
        isOpen={showCreateFolderModal}
        onClose={() => {
          setShowCreateFolderModal(false);
          setFolderName('');
        }}
        title="创建文件夹"
        footer={
          <>
            <Button 
              variant="ghost" 
              onClick={() => {
                setShowCreateFolderModal(false);
                setFolderName('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleCreateFolder}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              文件夹名称 *
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入文件夹名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FileManager;