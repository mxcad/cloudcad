import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectsApi, filesApi } from '../services/apiService';
import { FileSystemNode, BreadcrumbItem } from '../types/filesystem';
import { ToastType, Toast } from '../components/ui/Toast';

export const useFileSystem = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{ projectId: string; nodeId?: string }>();
  
  // 状态管理
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  
  // 模态框状态
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingNode, setEditingNode] = useState<FileSystemNode | null>(null);
  const [folderName, setFolderName] = useState('');
  
  // Toast 状态
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
  });

  // Toast 操作
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    
    // 自动移除 Toast
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // 确认对话框操作
  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void, type: 'danger' | 'warning' | 'info' = 'warning') => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          onConfirm();
          closeConfirm();
        },
        type,
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  // 获取当前节点信息
  const loadCurrentNode = useCallback(async () => {
    if (!projectId) return;
    
    // 如果当前没有节点信息，说明是根目录，不需要额外加载
    if (!nodeId && !currentNode) {
      return;
    }
    
    const currentNodeId = nodeId || currentNode?.id || projectId;
    setLoading(true);
    setError(null);
    
    try {
      const response = await projectsApi.getNode(currentNodeId);
      setCurrentNode(response.data);
    } catch (err: any) {
      setError(err.message || '加载节点信息失败');
      showToast('加载节点信息失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, nodeId, currentNode?.id, showToast]);

  // 加载子节点
  const loadChildren = useCallback(async () => {
    if (!projectId) return;
    
    const currentNodeId = nodeId || currentNode?.id || projectId;
    setLoading(true);
    setError(null);
    
    try {
      const response = await projectsApi.getChildren(currentNodeId);
      setNodes(response.data);
    } catch (err: any) {
      setError(err.message || '加载文件列表失败');
      showToast('加载文件列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, nodeId, currentNode?.id, showToast]);

  // 构建面包屑导航
  const buildBreadcrumbs = useCallback(async () => {
    if (!projectId) return;
    
    // 如果没有 nodeId 和 currentNode，说明是根目录，不需要构建面包屑
    if (!nodeId && !currentNode) {
      setBreadcrumbs([]);
      return;
    }
    
    const currentNodeId = nodeId || currentNode?.id || projectId;
    const crumbs: BreadcrumbItem[] = [];
    const visited = new Set<string>();
    
    try {
      let node: FileSystemNode | null = null;
      
      // 获取当前节点信息
      const response = await projectsApi.getNode(currentNodeId);
      node = response.data;
      
      // 向上遍历构建面包屑
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
    } catch (err: any) {
      console.error('构建面包屑失败:', err);
    }
  }, [projectId, nodeId, currentNode?.id]);

  // 刷新操作
  const handleRefresh = useCallback(() => {
    loadChildren();
    loadCurrentNode();
    buildBreadcrumbs();
  }, [loadChildren, loadCurrentNode, buildBreadcrumbs]);

  // 返回上级
  const handleGoBack = useCallback(() => {
    if (breadcrumbs.length > 1) {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      navigate(`/projects/${projectId}/files/${parentCrumb.id}`);
    } else {
      navigate(`/projects/${projectId}`);
    }
  }, [breadcrumbs, navigate, projectId]);

  // 节点选择
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // 全选
  const handleSelectAll = useCallback(() => {
    const filteredNodes = nodes.filter(node =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (selectedNodes.size === filteredNodes.length) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(filteredNodes.map(node => node.id)));
    }
  }, [nodes, searchQuery, selectedNodes.size]);

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!folderName.trim() || !projectId) return;
    
    const parentNodeId = currentNode?.id || projectId;
    
    try {
      await projectsApi.createFolder(parentNodeId, { name: folderName.trim() });
      showToast('文件夹创建成功', 'success');
      setFolderName('');
      setShowCreateFolderModal(false);
      handleRefresh();
    } catch (err: any) {
      showToast(err.message || '创建文件夹失败', 'error');
    }
  };

  // 重命名
  const handleRename = async () => {
    if (!folderName.trim() || !editingNode || !projectId) return;
    
    try {
      await projectsApi.renameNode(editingNode.id, { name: folderName.trim() });
      showToast('重命名成功', 'success');
      setFolderName('');
      setShowRenameModal(false);
      setEditingNode(null);
      handleRefresh();
    } catch (err: any) {
      showToast(err.message || '重命名失败', 'error');
    }
  };

  // 删除节点
  const handleDelete = (node: FileSystemNode) => {
    showConfirm(
      '确认删除',
      `确定要删除"${node.name}"吗？${node.isFolder ? '此操作将同时删除文件夹内的所有内容。' : ''}`,
      async () => {
        try {
          await projectsApi.deleteNode(node.id);
          showToast('删除成功', 'success');
          handleRefresh();
        } catch (err: any) {
          showToast(err.message || '删除失败', 'error');
        }
      },
      'danger'
    );
  };

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    if (selectedNodes.size === 0) return;
    
    showConfirm(
      '批量删除',
      `确定要删除选中的 ${selectedNodes.size} 个项目吗？`,
      async () => {
        try {
          await Promise.all(
            Array.from(selectedNodes).map(nodeId => projectsApi.deleteNode(nodeId))
          );
          showToast('批量删除成功', 'success');
          setSelectedNodes(new Set());
          handleRefresh();
        } catch (err: any) {
          showToast(err.message || '批量删除失败', 'error');
        }
      },
      'danger'
    );
  }, [selectedNodes, showConfirm, handleRefresh]);

  // 进入文件夹
  const handleEnterFolder = (node: FileSystemNode) => {
    if (node.isFolder) {
      navigate(`/projects/${projectId}/files/${node.id}`);
    }
  };

  // 处理文件打开（包括CAD文件跳转到编辑器）
  const handleFileOpen = (node: FileSystemNode) => {
    if (node.isFolder) {
      navigate(`/projects/${projectId}/files/${node.id}`);
    } else {
      // 检查是否是CAD文件
      const cadExtensions = ['.dwg', '.dxf'];
      if (node.extension && cadExtensions.includes(node.extension.toLowerCase())) {
        // 跳转到CAD编辑器，传递项目上下文
        const queryParams = new URLSearchParams();
        queryParams.set('project', projectId);
        queryParams.set('parent', currentNode?.id || projectId);
        navigate(`/cad-editor/${node.id}?${queryParams.toString()}`);
      } else {
        // 非CAD文件，执行下载
        handleDownload(node);
      }
    }
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
      showToast('文件下载成功', 'success');
    } catch (err: any) {
      showToast(err.message || '文件下载失败', 'error');
    }
  };

  // 打开重命名对话框
  const handleOpenRename = (node: FileSystemNode) => {
    setEditingNode(node);
    setFolderName(node.name);
    setShowRenameModal(true);
  };

  return {
    // 状态
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    selectedNodes,
    toasts,
    confirmDialog,
    showCreateFolderModal,
    showRenameModal,
    folderName,
    setFolderName,
    editingNode,
    
    // 操作方法
    setShowCreateFolderModal,
    setShowRenameModal,
    setEditingNode,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
    loadCurrentNode,
    loadChildren,
    buildBreadcrumbs,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handleBatchDelete,
    handleEnterFolder,
    handleFileOpen,
    handleDownload,
    handleOpenRename,
  };
};