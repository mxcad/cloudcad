import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  X,
  CheckCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { FileUploader } from '../components/FileUploader';
import { projectsApi, filesApi } from '../services/apiService';

// Toast 通知组件
type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

const ToastContainer: React.FC<{
  toasts: Toast[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : toast.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : toast.type === 'warning'
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {toast.type === 'success' && <CheckCircle size={20} />}
          {toast.type === 'error' && <AlertCircle size={20} />}
          {toast.type === 'info' && <Info size={20} />}
          {toast.type === 'warning' && <AlertCircle size={20} />}
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="text-current opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

// 确认对话框组件
const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}> = ({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                type === 'danger'
                  ? 'bg-red-100 text-red-600'
                  : type === 'warning'
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-blue-100 text-blue-600'
              }`}
            >
              <AlertCircle size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {title}
              </h3>
              <p className="text-sm text-slate-600">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 rounded-b-lg">
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={type === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

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
  const { projectId, nodeId } = useParams<{
    projectId: string;
    nodeId?: string;
  }>();

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

  // Toast 通知状态
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
  });

  // 双击计时器
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);

  // 拖拽上传状态
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Toast 通知辅助函数
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 确认对话框辅助函数
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: 'danger' | 'warning' | 'info' = 'warning'
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm,
        type,
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog({
      isOpen: false,
      title: '',
      message: '',
      onConfirm: () => {},
    });
  }, []);

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
  const handleRefresh = useCallback(() => {
    loadCurrentNode();
    loadChildren();
  }, [loadCurrentNode, loadChildren]);

  // 返回上级
  const handleGoBack = useCallback(() => {
    if (breadcrumbs.length <= 1) {
      navigate('/projects');
    } else {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      if (parentCrumb.isRoot) {
        navigate(`/file-system/${parentCrumb.id}`);
      } else {
        navigate(`/file-system/${projectId}/${parentCrumb.id}`);
      }
    }
  }, [breadcrumbs, navigate, projectId]);

  // 节点选择
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    const filteredNodes = nodes.filter((node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (selectedNodes.size === filteredNodes.length) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(filteredNodes.map((n) => n.id)));
    }
  }, [nodes, searchQuery, selectedNodes.size]);

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    if (selectedNodes.size === 0) return;

    showConfirm(
      '批量删除',
      `确定要删除选中的 ${selectedNodes.size} 个项目吗？此操作不可恢复。`,
      async () => {
        try {
          setLoading(true);
          const count = selectedNodes.size;
          await Promise.all(
            Array.from(selectedNodes).map((nodeId) =>
              projectsApi.deleteNode(nodeId)
            )
          );
          setSelectedNodes(new Set());
          closeConfirm();
          await loadChildren();
          showToast(`已成功删除 ${count} 个项目`, 'success');
        } catch (error) {
          console.error('批量删除失败:', error);
          showToast('批量删除失败，请重试', 'error');
        } finally {
          setLoading(false);
        }
      },
      'danger'
    );
  }, [selectedNodes, showConfirm, closeConfirm, loadChildren, showToast]);

  // 拖拽上传事件处理
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      // 检查文件类型
      const allowedExtensions = [
        '.dwg',
        '.dxf',
        '.pdf',
        '.png',
        '.jpg',
        '.jpeg',
      ];
      const invalidFiles = files.filter((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return !allowedExtensions.includes(ext);
      });

      if (invalidFiles.length > 0) {
        showToast(
          `不支持的文件类型：${invalidFiles.map((f) => f.name).join(', ')}`,
          'error'
        );
        return;
      }

      // 上传文件
      showToast(`正在上传 ${files.length} 个文件...`, 'info');
      let successCount = 0;
      let failCount = 0;

      for (const file of files) {
        try {
          await filesApi.upload(file, currentNodeId);
          successCount++;
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        await loadChildren();
        showToast(`成功上传 ${successCount} 个文件`, 'success');
      }
      if (failCount > 0) {
        showToast(`${failCount} 个文件上传失败`, 'error');
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [currentNodeId, loadChildren, showToast]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + A: 全选
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      // Delete: 删除选中项
      if (e.key === 'Delete' && selectedNodes.size > 0) {
        e.preventDefault();
        handleBatchDelete();
      }

      // Escape: 取消选择
      if (e.key === 'Escape') {
        setSelectedNodes(new Set());
      }

      // Ctrl/Cmd + N: 新建文件夹
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowCreateFolderModal(true);
      }

      // Ctrl/Cmd + U: 上传文件
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        setShowUploadModal(true);
      }

      // F5 或 Ctrl/Cmd + R: 刷新
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
        e.preventDefault();
        handleRefresh();
      }

      // Backspace: 返回上级
      if (
        e.key === 'Backspace' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        handleGoBack();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    selectedNodes,
    handleBatchDelete,
    handleRefresh,
    handleGoBack,
    handleSelectAll,
  ]);

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      showToast('请输入文件夹名称', 'warning');
      return;
    }

    if (!currentNodeId) {
      showToast('无法创建文件夹：未选择父节点', 'error');
      return;
    }

    try {
      setLoading(true);
      console.log(
        `[FileSystemManager] 创建文件夹: ${folderName} 在节点 ${currentNodeId}`
      );
      await projectsApi.createFolder(currentNodeId, {
        name: folderName.trim(),
      });
      setShowCreateFolderModal(false);
      setFolderName('');
      await loadChildren();
      showToast(`文件夹"${folderName.trim()}"创建成功`, 'success');
    } catch (error) {
      console.error('创建文件夹失败:', error);
      showToast('创建文件夹失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 重命名节点
  const handleRename = async () => {
    if (!editingNode || !folderName.trim()) {
      showToast('请输入新名称', 'warning');
      return;
    }

    if (folderName.trim() === editingNode.name) {
      showToast('名称未改变', 'info');
      setShowRenameModal(false);
      setEditingNode(null);
      setFolderName('');
      return;
    }

    try {
      setLoading(true);
      await projectsApi.updateNode(editingNode.id, { name: folderName.trim() });
      setShowRenameModal(false);
      const oldName = editingNode.name;
      setEditingNode(null);
      setFolderName('');
      await loadChildren();
      showToast(`"${oldName}"已重命名为"${folderName.trim()}"`, 'success');
    } catch (error) {
      console.error('重命名失败:', error);
      showToast('重命名失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 删除节点
  const handleDelete = (node: FileSystemNode) => {
    const title = node.isFolder ? '删除文件夹' : '删除文件';
    const message = node.isFolder
      ? `确定要删除文件夹"${node.name}"吗？此操作将删除文件夹内的所有内容，且不可恢复。`
      : `确定要删除文件"${node.name}"吗？此操作不可恢复。`;

    showConfirm(
      title,
      message,
      async () => {
        try {
          setLoading(true);
          await projectsApi.deleteNode(node.id);
          closeConfirm();
          await loadChildren();
          // 如果删除的节点在选中列表中，移除它
          setSelectedNodes((prev) => {
            const newSet = new Set(prev);
            newSet.delete(node.id);
            return newSet;
          });
          showToast(`"${node.name}"已删除`, 'success');
        } catch (error) {
          console.error('删除失败:', error);
          showToast('删除失败，请重试', 'error');
        } finally {
          setLoading(false);
        }
      },
      'danger'
    );
  };

  // 进入文件夹（双击）
  const handleEnterFolder = (node: FileSystemNode) => {
    if (!node.isFolder) return;

    if (node.isRoot) {
      navigate(`/file-system/${node.id}`);
    } else {
      navigate(`/file-system/${projectId}/${node.id}`);
    }
  };

  // 处理节点点击（单击选择，双击进入）
  const handleNodeClick = (node: FileSystemNode) => {
    const now = Date.now();
    const lastClick = lastClickRef.current;

    // 检测双击
    if (
      lastClick &&
      lastClick.nodeId === node.id &&
      now - lastClick.time < 300 // 300ms 内的第二次点击视为双击
    ) {
      // 双击：进入文件夹
      if (node.isFolder) {
        handleEnterFolder(node);
      }
      lastClickRef.current = null;
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    } else {
      // 单击：选择节点
      lastClickRef.current = { nodeId: node.id, time: now };
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      clickTimerRef.current = setTimeout(() => {
        handleNodeSelect(node.id);
        lastClickRef.current = null;
      }, 300);
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

  // 文件上传成功
  const handleFileUpload = async (file: File, result: any) => {
    console.log(`[FileSystemManager] 文件上传成功:`, {
      fileName: file.name,
      result,
    });
    showToast(`文件"${file.name}"上传成功`, 'success');
    setShowUploadModal(false);
    await loadChildren();
  };

  // 调试：输出 currentNodeId
  console.log('[FileSystemManager] currentNodeId:', currentNodeId);

  // 文件上传错误
  const handleUploadError = (file: File, error: Error) => {
    console.error(`上传文件 ${file.name} 失败:`, error);
    showToast(`文件"${file.name}"上传失败`, 'error');
  };

  // 文件下载
  const handleDownload = async (node: FileSystemNode) => {
    if (node.isFolder) return;

    try {
      showToast(`正在下载"${node.name}"...`, 'info');
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
      showToast(`"${node.name}"下载成功`, 'success');
    } catch (error) {
      console.error('文件下载失败:', error);
      showToast('文件下载失败，请重试', 'error');
    }
  };

  // 打开重命名模态框
  const handleOpenRename = (node: FileSystemNode) => {
    setEditingNode(node);
    setFolderName(node.name);
    setShowRenameModal(true);
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
    <div className="max-w-7xl mx-auto space-y-6 relative">
      {/* 拖拽上传遮罩层 */}
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-indigo-500 bg-opacity-20 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-12 text-center animate-scale-in">
            <Upload size={64} className="mx-auto text-indigo-600 mb-4" />
            <h3 className="text-2xl font-bold text-slate-900 mb-2">
              拖放文件到此处上传
            </h3>
            <p className="text-slate-600">
              支持 .dwg, .dxf, .pdf, .png, .jpg, .jpeg 格式
            </p>
          </div>
        </div>
      )}

      {/* 页面标题和面包屑导航 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleGoBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              title="返回上级"
            >
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
              文件系统
            </h1>
          </div>

          {/* 面包屑导航 */}
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-600 overflow-x-auto pb-1">
            <button
              onClick={() => navigate('/projects')}
              className="hover:text-indigo-600 transition-colors flex-shrink-0"
            >
              <Home size={16} />
            </button>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight
                  size={14}
                  className="text-slate-400 flex-shrink-0"
                />
                <button
                  onClick={() => handleBreadcrumbClick(crumb)}
                  className={`hover:text-indigo-600 transition-colors whitespace-nowrap ${
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

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            size="sm"
            className="flex-shrink-0"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline ml-2">刷新</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowUploadModal(true)}
            size="sm"
          >
            <Upload size={16} />
            <span className="ml-2">上传</span>
          </Button>
          <Button onClick={() => setShowCreateFolderModal(true)} size="sm">
            <FolderPlus size={16} />
            <span className="ml-2">新建</span>
          </Button>
        </div>
      </div>

      {/* 搜索和操作栏 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-full sm:max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="搜索文件和文件夹..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* 视图切换和批量操作 */}
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          {selectedNodes.size > 0 && (
            <Button variant="danger" size="sm" onClick={handleBatchDelete}>
              <Trash2 size={14} className="sm:mr-2" />
              <span className="hidden xs:inline">删除</span>
              <span className="ml-1">({selectedNodes.size})</span>
            </Button>
          )}

          <div className="flex border rounded-lg flex-shrink-0">
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
          <div className="flex flex-col items-center justify-center py-16">
            {searchQuery ? (
              <>
                <Search size={64} className="text-slate-300 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  没有找到匹配的文件
                </h3>
                <p className="text-slate-500 mb-6 text-center max-w-md">
                  没有找到包含&ldquo;{searchQuery}&rdquo;的文件或文件夹
                  <br />
                  尝试使用其他关键词搜索
                </p>
                <Button variant="outline" onClick={() => setSearchQuery('')}>
                  清除搜索
                </Button>
              </>
            ) : (
              <>
                <FolderPlus size={64} className="text-slate-300 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  文件夹为空
                </h3>
                <p className="text-slate-500 mb-6 text-center max-w-md">
                  开始上传文件或创建文件夹来组织您的项目
                  <br />
                  <span className="text-sm text-slate-400 mt-2 inline-block">
                    提示：您可以直接拖拽文件到页面上传
                  </span>
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <Upload size={16} className="mr-2" />
                    上传文件
                    <span className="ml-2 text-xs text-slate-400">Ctrl+U</span>
                  </Button>
                  <Button onClick={() => setShowCreateFolderModal(true)}>
                    <FolderPlus size={16} className="mr-2" />
                    新建文件夹
                    <span className="ml-2 text-xs text-slate-400">Ctrl+N</span>
                  </Button>
                </div>
                <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200 max-w-md">
                  <h4 className="text-sm font-medium text-slate-900 mb-2">
                    💡 快捷键提示
                  </h4>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        Ctrl+N
                      </kbd>{' '}
                      新建文件夹
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        Ctrl+U
                      </kbd>{' '}
                      上传文件
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        Ctrl+A
                      </kbd>{' '}
                      全选
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        Delete
                      </kbd>{' '}
                      删除选中项
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        Backspace
                      </kbd>{' '}
                      返回上级
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded">
                        F5
                      </kbd>{' '}
                      刷新
                    </div>
                  </div>
                </div>
              </>
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
                    onClick={() => handleNodeClick(node)}
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
                        onClick={() => handleNodeClick(node)}
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
                              <span className="text-xl">
                                {getFileIcon(node)}
                              </span>
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
            parentId={currentNodeId}
            onUploadComplete={handleFileUpload}
            onUploadError={handleUploadError}
            maxFiles={10}
            accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
          />
        </div>
      </Modal>

      {/* Toast 通知容器 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
        }}
        onCancel={closeConfirm}
        type={confirmDialog.type}
      />
    </div>
  );
};

export default FileSystemManager;
