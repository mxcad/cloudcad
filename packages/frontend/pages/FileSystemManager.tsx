import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Edit,
  MoreVertical,
  Folder,
  File,
  Home,
  ChevronRight,
  Search,
  Grid,
  List,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { FileUploader } from '../components/FileUploader';
import { projectsApi, filesApi } from '../services/apiService';

// 类型定义
type FileSystemNode = {
  id: string;
  name: string;
  isFolder: boolean;
  isRoot: boolean;
  parentId: string | null;
  originalName?: string | null;
  path?: string | null;
  size?: number | null;
  mimeType?: string | null;
  extension?: string | null;
  fileStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  fileHash?: string | null;
  description?: string | null;
  projectStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    children?: number;
  };
};

type BreadcrumbItem = {
  id: string;
  name: string;
  isRoot: boolean;
};

export const FileSystemManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{ projectId: string; nodeId?: string }>();

  // 当前节点ID（项目根或子文件夹）
  const currentNodeId = nodeId || projectId || '';

  // 状态管理
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());

  // Modal 状态
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingNode, setEditingNode] = useState<FileSystemNode | null>(null);
  const [folderName, setFolderName] = useState('');

  // 加载当前节点信息
  const loadCurrentNode = useCallback(async () => {
    if (!currentNodeId) return;

    try {
      const response = await projectsApi.getNode(currentNodeId);
      setCurrentNode(response.data);
    } catch (error) {
      console.error('加载节点信息失败:', error);
    }
  }, [currentNodeId]);

  // 加载子节点列表
  const loadChildren = useCallback(async () => {
    if (!currentNodeId) {
      setNodes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`[FileSystemManager] 加载节点 ${currentNodeId} 的子节点...`);
      const response = await projectsApi.getChildren(currentNodeId);
      console.log(`[FileSystemManager] API响应:`, response);

      const childNodes = response.data || [];
      console.log(`[FileSystemManager] 子节点列表:`, childNodes);

      setNodes(Array.isArray(childNodes) ? childNodes : []);
    } catch (error) {
      console.error('加载子节点失败:', error);
      setError('加载文件列表失败');
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [currentNodeId]);

  // 构建面包屑导航
  const buildBreadcrumbs = useCallback(async () => {
    if (!currentNodeId) {
      setBreadcrumbs([]);
      return;
    }

    try {
      const crumbs: BreadcrumbItem[] = [];
      let node = currentNode;

      // 如果当前节点未加载，先加载
      if (!node) {
        const response = await projectsApi.getNode(currentNodeId);
        node = response.data;
      }

      // 从当前节点向上追溯到根节点
      const visited = new Set<string>();
      while (node && !visited.has(node.id)) {
        visited.add(node.id);
        crumbs.unshift({
          id: node.id,
          name: node.name,
          isRoot: node.isRoot,
        });

        if (node.parentId) {
          const parentResponse = await projectsApi.getNode(node.parentId);
          node = parentResponse.data;
        } else {
          break;
        }
      }

      setBreadcrumbs(crumbs);
    } catch (error) {
      console.error('构建面包屑导航失败:', error);
      setBreadcrumbs([]);
    }
  }, [currentNodeId, currentNode]);

  // 页面加载时获取数据
  useEffect(() => {
    loadCurrentNode();
    loadChildren();
  }, [loadCurrentNode, loadChildren]);

  // 当前节点变化时重新构建面包屑
  useEffect(() => {
    buildBreadcrumbs();
  }, [buildBreadcrumbs]);

  // 刷新列表
  const handleRefresh = () => {
    loadCurrentNode();
    loadChildren();
  };

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      alert('请输入文件夹名称');
      return;
    }

    if (!currentNodeId) {
      alert('无法创建文件夹：未选择父节点');
      return;
    }

    try {
      console.log(`[FileSystemManager] 创建文件夹: ${folderName} 在节点 ${currentNodeId}`);
      await projectsApi.createFolder(currentNodeId, { name: folderName.trim() });
      setShowCreateFolderModal(false);
      setFolderName('');
      await loadChildren();
      alert('文件夹创建成功');
    } catch (error) {
      console.error('创建文件夹失败:', error);
      alert('创建文件夹失败');
    }
  };

  // 重命名节点
  const handleRename = async () => {
    if (!editingNode || !folderName.trim()) {
      alert('请输入新名称');
      return;
    }

    try {
      await projectsApi.updateNode(editingNode.id, { name: folderName.trim() });
      setShowRenameModal(false);
      setEditingNode(null);
      setFolderName('');
      await loadChildren();
      alert('重命名成功');
    } catch (error) {
      console.error('重命名失败:', error);
      alert('重命名失败');
    }
  };

  // 删除节点
  const handleDelete = async (node: FileSystemNode) => {
    const confirmMessage = node.isFolder
      ? `确定要删除文件夹"${node.name}"吗？此操作将删除文件夹内的所有内容。`
      : `确定要删除文件"${node.name}"吗？`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await projectsApi.deleteNode(node.id);
      await loadChildren();
      alert('删除成功');
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedNodes.size === 0) return;

    if (!window.confirm(`确定要删除选中的 ${selectedNodes.size} 个项目吗？`)) return;

    try {
      await Promise.all(
        Array.from(selectedNodes).map((nodeId) => projectsApi.deleteNode(nodeId))
      );
      setSelectedNodes(new Set());
      await loadChildren();
      alert('批量删除成功');
    } catch (error) {
      console.error('批量删除失败:', error);
      alert('批量删除失败');
    }
  };

  // 进入文件夹
  const handleEnterFolder = (node: FileSystemNode) => {
    if (!node.isFolder) return;

    if (node.isRoot) {
      navigate(`/file-system/${node.id}`);
    } else {
      navigate(`/file-system/${projectId}/${node.id}`);
    }
  };

  // 面包屑导航点击
  const handleBreadcrumbClick = (crumb: BreadcrumbItem) => {
    if (crumb.id === currentNodeId) return;

    if (crumb.isRoot) {
      navigate(`/file-system/${crumb.id}`);
    } else {
      navigate(`/file-system/${projectId}/${crumb.id}`);
    }
  };

  // 返回上级
  const handleGoBack = () => {
    if (breadcrumbs.length <= 1) {
      navigate('/projects');
    } else {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      handleBreadcrumbClick(parentCrumb);
    }
  };

  // 文件上传成功
  const handleFileUpload = async (file: File, result: any) => {
    console.log(`[FileSystemManager] 文件上传成功:`, { fileName: file.name, result });
    setShowUploadModal(false);
    await loadChildren();
  };

  // 文件上传错误
  const handleUploadError = (file: File, error: Error) => {
    console.error(`上传文件 ${file.name} 失败:`, error);
  };

  // 文件下载
  const handleDownload = async (node: FileSystemNode) => {
    if (node.isFolder) return;

    try {
      const response = await filesApi.download(node.id);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = node.originalName || node.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('文件下载失败:', error);
      alert('文件下载失败');
    }
  };

  // 打开重命名模态框
  const handleOpenRename = (node: FileSystemNode) => {
    setEditingNode(node);
    setFolderName(node.name);
    setShowRenameModal(true);
  };

  // 节点选择
  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedNodes.size === filteredNodes.length) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(filteredNodes.map((n) => n.id)));
    }
  };

  // 过滤节点
  const filteredNodes = nodes.filter((node) =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 格式化文件大小
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 获取文件图标
  const getFileIcon = (node: FileSystemNode) => {
    if (node.isFolder) {
      return <Folder size={20} className="text-blue-500" />;
    }

    const mimeType = node.mimeType || '';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('dwg') || mimeType.includes('dxf')) return '📐';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    if (mimeType.includes('text')) return '📝';
    return <File size={20} className="text-gray-500" />;
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>请先选择一个项目</p>
        <Button onClick={() => navigate('/projects')} className="mt-4">
          返回项目列表
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 页面标题和面包屑导航 */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleGoBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="返回上级"
            >
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <h1 className="text-2xl font-bold text-slate-900">文件系统</h1>
          </div>

          {/* 面包屑导航 */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <button
              onClick={() => navigate('/projects')}
              className="hover:text-indigo-600 transition-colors"
            >
              <Home size={16} />
            </button>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight size={14} className="text-slate-400" />
                <button
                  onClick={() => handleBreadcrumbClick(crumb)}
                  className={`hover:text-indigo-600 transition-colors ${
                    index === breadcrumbs.length - 1
                      ? 'font-medium text-slate-900'
                      : ''
                  }`}
                  disabled={crumb.id === currentNodeId}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="outline" onClick={() => setShowUploadModal(true)}>
            <Upload size={16} className="mr-2" />
            上传文件
          </Button>
          <Button onClick={() => setShowCreateFolderModal(true)}>
            <FolderPlus size={16} className="mr-2" />
            新建文件夹
          </Button>
        </div>
      </div>

      {/* 搜索和操作栏 */}
      <div className="flex items-center justify-between gap-4">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="搜索文件和文件夹..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* 视图切换和批量操作 */}
        <div className="flex items-center gap-2">
          {selectedNodes.size > 0 && (
            <Button variant="danger" size="sm" onClick={handleBatchDelete}>
              删除选中 ({selectedNodes.size})
            </Button>
          )}

          <div className="flex border rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid'
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="网格视图"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 border-l ${
                viewMode === 'list'
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="列表视图"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="bg-white rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-slate-500">加载中...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <p className="text-red-500">{error}</p>
            <Button onClick={handleRefresh} className="mt-4">
              重试
            </Button>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FolderPlus size={48} className="text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchQuery ? '没有找到匹配的文件' : '文件夹为空'}
            </h3>
            <p className="text-slate-500 mb-4">
              {searchQuery ? '尝试其他搜索关键词' : '开始上传文件或创建文件夹'}
            </p>
            {!searchQuery && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowUploadModal(true)}>
                  <Upload size={16} className="mr-2" />
                  上传文件
                </Button>
                <Button onClick={() => setShowCreateFolderModal(true)}>
                  <FolderPlus size={16} className="mr-2" />
                  新建文件夹
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* 全选按钮 */}
            {filteredNodes.length > 0 && (
              <div className="mb-4 flex items-center">
                <input
                  type="checkbox"
                  checked={
                    selectedNodes.size === filteredNodes.length &&
                    filteredNodes.length > 0
                  }
                  onChange={handleSelectAll}
                  className="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">
                  {selectedNodes.size > 0
                    ? `已选中 ${selectedNodes.size} 项`
                    : '全选'}
                </span>
              </div>
            )}

            {/* 网格视图 */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredNodes.map((node) => (
                  <div
                    key={node.id}
                    className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                      selectedNodes.has(node.id)
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200'
                    }`}
                    onClick={() =>
                      node.isFolder ? handleEnterFolder(node) : handleNodeSelect(node.id)
                    }
                  >
                    {/* 选择框 */}
                    <div className="flex items-start justify-between mb-3">
                      <input
                        type="checkbox"
                        checked={selectedNodes.has(node.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleNodeSelect(node.id);
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // 显示更多操作菜单
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>

                    {/* 图标和名称 */}
                    <div className="text-center mb-3">
                      <div className="flex justify-center mb-2">
                        {typeof getFileIcon(node) === 'string' ? (
                          <span className="text-4xl">{getFileIcon(node)}</span>
                        ) : (
                          <div className="text-4xl">{getFileIcon(node)}</div>
                        )}
                      </div>
                      <h3
                        className="text-sm font-medium text-slate-900 truncate"
                        title={node.name}
                      >
                        {node.name}
                      </h3>
                    </div>

                    {/* 文件信息 */}
                    <div className="text-xs text-slate-500 space-y-1">
                      {!node.isFolder && (
                        <>
                          <div>大小: {formatFileSize(node.size)}</div>
                          {node.extension && (
                            <div>类型: {node.extension.toUpperCase()}</div>
                          )}
                        </>
                      )}
                      {node.isFolder && node._count?.children !== undefined && (
                        <div>{node._count.children} 项</div>
                      )}
                      <div>更新: {formatDate(node.updatedAt)}</div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="mt-3 flex justify-between gap-1">
                      {!node.isFolder && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(node);
                          }}
                        >
                          <Download size={12} />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRename(node);
                        }}
                      >
                        <Edit size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(node);
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 列表视图 */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4">
                        <input
                          type="checkbox"
                          checked={
                            selectedNodes.size === filteredNodes.length &&
                            filteredNodes.length > 0
                          }
                          onChange={handleSelectAll}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-900">
                        名称
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-900">
                        大小
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-900">
                        类型
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-900">
                        修改时间
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-900">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map((node) => (
                      <tr
                        key={node.id}
                        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                          selectedNodes.has(node.id) ? 'bg-indigo-50' : ''
                        }`}
                        onClick={() =>
                          node.isFolder
                            ? handleEnterFolder(node)
                            : handleNodeSelect(node.id)
                        }
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedNodes.has(node.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleNodeSelect(node.id);
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {typeof getFileIcon(node) === 'string' ? (
                              <span className="text-xl">{getFileIcon(node)}</span>
                            ) : (
                              getFileIcon(node)
                            )}
                            <div>
                              <div className="text-sm font-medium text-slate-900">
                                {node.name}
                              </div>
                              {node.originalName &&
                                node.originalName !== node.name && (
                                  <div className="text-xs text-slate-500">
                                    {node.originalName}
                                  </div>
                                )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {node.isFolder
                            ? node._count?.children !== undefined
                              ? `${node._count.children} 项`
                              : '-'
                            : formatFileSize(node.size)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {node.isFolder
                            ? '文件夹'
                            : node.extension?.toUpperCase() || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {formatDate(node.updatedAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {!node.isFolder && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(node);
                                }}
                              >
                                <Download size={14} />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenRename(node);
                              }}
                            >
                              <Edit size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(node);
                              }}
                            >
                              <Trash2 size={14} />
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
            <Button onClick={handleCreateFolder}>创建</Button>
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

      {/* 重命名模态框 */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        title={`重命名${editingNode?.isFolder ? '文件夹' : '文件'}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowRenameModal(false);
                setEditingNode(null);
                setFolderName('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleRename}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              新名称 *
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRename()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入新名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 上传文件模态框 */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="上传文件"
        footer={
          <Button variant="ghost" onClick={() => setShowUploadModal(false)}>
            关闭
          </Button>
        }
      >
        <div className="space-y-4">
          <FileUploader
            projectId={currentNodeId}
            onUploadComplete={handleFileUpload}
            onUploadError={handleUploadError}
            maxFiles={10}
            accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
          />
        </div>
      </Modal>
    </div>
  );
};

export default FileSystemManager;
