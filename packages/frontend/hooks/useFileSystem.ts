import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  projectsApi,
  filesApi,
  trashApi,
  mxcadApi,
} from '../services/apiService';
import { FileSystemNode, BreadcrumbItem } from '../types/filesystem';
import { ToastType, Toast } from '../components/ui/Toast';

export const useFileSystem = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{
    projectId: string;
    nodeId?: string;
  }>();
  const location = useLocation();

  // 从 URL 路径直接解析 projectId 和 nodeId（更可靠的方式）
  const urlProjectId = useMemo(() => {
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname]);

  const urlNodeId = useMemo(() => {
    const match = location.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  // 是否为项目根目录模式（无 projectId）
  const isProjectRootMode = !urlProjectId;
  // 是否为文件夹模式（有 projectId）
  const isFolderMode = !!urlProjectId; // 状态管理
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false); // 多选模式开关

  // 拖拽状态
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 强制刷新计数器，用于解决闭包中 URL 参数过期问题
  const [refreshCount, setRefreshCount] = useState(0);

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
    setToasts((prev) => [...prev, { id, type, message }]);

    // 自动移除 Toast
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 确认对话框操作
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
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * 检查文件是否缺失外部参照（任务008）
   */
  const checkMissingExternalReferences = useCallback(
    async (
      node: FileSystemNode
    ): Promise<{ hasMissing: boolean; count: number }> => {
      // 只有 DWG/DXF 文件才需要检查外部参照
      const cadExtensions = ['.dwg', '.dxf'];
      if (!node.fileHash || node.isFolder || !node.extension) {
        return { hasMissing: false, count: 0 };
      }

      // 检查文件扩展名是否为 CAD 文件
      if (!cadExtensions.includes(node.extension.toLowerCase())) {
        return { hasMissing: false, count: 0 };
      }

      try {
        const response = await mxcadApi.getPreloadingData(node.fileHash);
        const preloadingData = response.data;

        if (!preloadingData || typeof preloadingData !== 'object') {
          return { hasMissing: false, count: 0 };
        }

        // 确保 images 和 externalReference 存在
        const images = preloadingData.images || [];
        const externalReference = preloadingData.externalReference || [];

        // 过滤掉 http/https 开头的 URL（已有外部参照）
        const missingImages = images.filter(
          (name: string) =>
            !name.startsWith('http:') && !name.startsWith('https:')
        );
        const missingRefs = externalReference;

        if (missingImages.length === 0 && missingRefs.length === 0) {
          return { hasMissing: false, count: 0 };
        }

        // 检查哪些文件缺失
        let missingCount = 0;

        for (const name of missingRefs) {
          try {
            const existsResponse = await mxcadApi.checkExternalReferenceExists(
              node.fileHash!,
              name
            );
            if (!existsResponse.data.exists) {
              missingCount++;
            }
          } catch {
            missingCount++;
          }
        }

        for (const name of missingImages) {
          try {
            const existsResponse = await mxcadApi.checkExternalReferenceExists(
              node.fileHash!,
              name
            );
            if (!existsResponse.data.exists) {
              missingCount++;
            }
          } catch {
            missingCount++;
          }
        }

        return { hasMissing: missingCount > 0, count: missingCount };
      } catch (error) {
        console.error('[useFileSystem] 检查外部参照失败:', error);
        return { hasMissing: false, count: 0 };
      }
    },
    []
  );

  // 刷新操作 - 使用 forceRefresh 确保获取最新 URL 参数
  const handleRefresh = useCallback(() => {
    // 增加计数器，强制 useEffect 重新执行 loadData
    // 这样可以确保 loadData 使用最新的 projectId 和 nodeId
    console.log('[handleRefresh] 触发刷新，refreshCount=', refreshCount + 1);
    setRefreshCount((prev) => prev + 1);
  }, [refreshCount]);

  // 从节点构建面包屑
  const buildBreadcrumbsFromNode = useCallback(async (node: FileSystemNode) => {
    const crumbs: BreadcrumbItem[] = [];
    const visited = new Set<string>();
    let currentNode: FileSystemNode | null = node;

    try {
      // 向上遍历构建面包屑
      while (currentNode && !visited.has(currentNode.id)) {
        visited.add(currentNode.id);
        crumbs.unshift({
          id: currentNode.id,
          name: currentNode.name,
          isRoot: currentNode.isRoot,
        });

        if (currentNode.parentId) {
          const parentResponse = await projectsApi.getNode(
            currentNode.parentId
          );
          currentNode = parentResponse.data;
        } else {
          break;
        }
      }

      setBreadcrumbs(crumbs);
    } catch (err: any) {
      // 静默：构建面包屑失败
      // 如果构建失败，至少显示当前节点
      setBreadcrumbs([
        {
          id: node.id,
          name: node.name,
          isRoot: node.isRoot,
        },
      ]);
    }
  }, []);

  // 兼容性方法
  const loadCurrentNode = useCallback(() => {
    // 已合并到 loadData 中
  }, []);

  const loadChildren = useCallback(() => {
    // 已合并到 loadData 中
  }, []);

  const buildBreadcrumbs = useCallback(() => {
    // 已合并到 loadData 中
  }, []);

  // 统一的数据加载函数
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedNodes(new Set<string>()); // 清除选中状态
    setIsMultiSelectMode(false); // 清除多选模式

    try {
      if (isProjectRootMode) {
        // 项目根目录模式：加载项目列表
        const response = await projectsApi.list();
        const allProjects = response.data || [];
        setNodes(allProjects);
        setCurrentNode(null);
        setBreadcrumbs([]);
        console.log(
          '[loadData] 项目根目录模式，加载项目列表:',
          allProjects.length,
          '个项目'
        );
      } else {
        // 文件夹模式：加载项目/文件夹内容
        const currentNodeId = urlNodeId || urlProjectId;
        const [nodeResponse, childrenResponse] = await Promise.all([
          projectsApi.getNode(currentNodeId),
          projectsApi.getChildren(currentNodeId),
        ]);
        const nodeData = nodeResponse.data;
        const childrenData = childrenResponse.data || [];
        setCurrentNode(nodeData);

        // 检查每个文件是否缺失外部参照（任务008）
        const nodesWithExternalReferenceCheck = await Promise.all(
          childrenData.map(async (node: FileSystemNode) => {
            if (node.isFolder) {
              return node;
            }

            const { hasMissing, count } =
              await checkMissingExternalReferences(node);

            return {
              ...node,
              hasMissingExternalReferences: hasMissing,
              missingExternalReferencesCount: count,
            };
          })
        );

        setNodes(nodesWithExternalReferenceCheck);

        // 构建面包屑
        await buildBreadcrumbsFromNode(nodeData);
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || err.message || '加载数据失败';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    showToast,
    buildBreadcrumbsFromNode,
    checkMissingExternalReferences,
  ]);

  // 返回上级
  const handleGoBack = useCallback(() => {
    if (currentNode?.parentId) {
      navigate(`/projects/${urlProjectId}/files/${currentNode.parentId}`);
    } else {
      navigate('/projects'); // 没有父节点，返回项目列表
    }
  }, [currentNode, navigate, urlProjectId]);

  // 节点选择
  const handleNodeSelect = useCallback(
    (nodeId: string, isMultiSelect: boolean = false) => {
      setSelectedNodes((prev) => {
        if (isMultiSelect) {
          // 多选模式：toggle
          const newSet = new Set(prev);
          if (newSet.has(nodeId)) {
            newSet.delete(nodeId);
          } else {
            newSet.add(nodeId);
          }
          return newSet;
        } else {
          // 单选模式：只选中当前
          return new Set([nodeId]);
        }
      });
    },
    []
  );

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    const filteredNodes = nodes.filter((node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedNodes.size === filteredNodes.length) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(filteredNodes.map((node) => node.id)));
    }
  }, [nodes, searchQuery, selectedNodes.size]);

  // 创建文件夹
  const handleCreateFolder = useCallback(async () => {
    if (!folderName.trim() || !urlProjectId) {
      showToast('文件夹名称不能为空', 'error');
      return null;
    }

    const parentNodeId = currentNode?.id || urlProjectId;

    try {
      const response = await projectsApi.createFolder(parentNodeId, {
        name: folderName.trim(),
      });
      const newFolder = response.data;
      showToast('文件夹创建成功', 'success');
      setFolderName('');
      setShowCreateFolderModal(false);

      // 刷新当前目录列表，不自动进入新创建的文件夹
      loadData();

      return newFolder;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || err.message || '创建文件夹失败';
      showToast(errorMessage, 'error');
      return null;
    }
  }, [folderName, urlProjectId, currentNode, loadData, showToast]);

  // 重命名
  const handleRename = useCallback(async () => {
    if (!folderName.trim() || !editingNode || !urlProjectId) {
      showToast('名称不能为空', 'error');
      return;
    }

    try {
      await projectsApi.updateNode(editingNode.id, { name: folderName.trim() });
      showToast('重命名成功', 'success');
      setFolderName('');
      setShowRenameModal(false);
      setEditingNode(null);
      loadData();
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || err.message || '重命名失败';
      showToast(errorMessage, 'error');
    }
  }, [folderName, editingNode, urlProjectId, loadData, showToast]);

  // 删除节点（默认到回收站）
  const handleDelete = useCallback(
    (node: FileSystemNode, permanently: boolean = false) => {
      let deleteMessage: string;
      let deleteApi: Promise<unknown>;

      if (permanently) {
        // 彻底删除
        if (node.isRoot) {
          deleteMessage = `确定要彻底删除项目"${node.name}"吗？此操作将同时删除项目内的所有内容，且不可恢复。`;
          deleteApi = projectsApi.delete(node.id);
        } else if (node.isFolder) {
          deleteMessage = `确定要彻底删除文件夹"${node.name}"吗？此操作将同时删除文件夹内的所有内容，且不可恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        } else {
          deleteMessage = `确定要彻底删除文件"${node.name}"吗？此操作不可恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        }
      } else {
        // 移到回收站
        if (node.isRoot) {
          deleteMessage = `确定要将项目"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.delete(node.id);
        } else if (node.isFolder) {
          deleteMessage = `确定要将文件夹"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        } else {
          deleteMessage = `确定要将文件"${node.name}"移到回收站吗？可以在回收站中恢复。`;
          deleteApi = projectsApi.deleteNode(node.id);
        }
      }

      showConfirm(
        permanently ? '确认彻底删除' : '确认删除',
        deleteMessage,
        async () => {
          try {
            await deleteApi;
            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
            loadData();
          } catch (err: any) {
            const errorMessage =
              err.response?.data?.message || err.message || '删除失败';
            showToast(errorMessage, 'error');
          }
        },
        permanently ? 'danger' : 'warning'
      );
    },
    [showConfirm, loadData, showToast]
  );

  // 批量删除
  const handleBatchDelete = useCallback(
    (permanently: boolean = false) => {
      if (selectedNodes.size === 0) {
        showToast('请先选择要删除的项目', 'error');
        return;
      }

      const message = permanently
        ? `确定要彻底删除选中的 ${selectedNodes.size} 个项目吗？此操作不可恢复。`
        : `确定要将选中的 ${selectedNodes.size} 个项目移到回收站吗？`;

      showConfirm(
        permanently ? '确认彻底删除' : '批量删除',
        message,
        async () => {
          try {
            await Promise.all(
              Array.from(selectedNodes).map((nodeId: string) => {
                const node = nodes.find((n) => n.id === nodeId);
                if (node?.isRoot) {
                  return projectsApi.delete(node.id);
                }
                return projectsApi.deleteNode(node.id);
              })
            );
            showToast(permanently ? '已彻底删除' : '已移到回收站', 'success');
            setSelectedNodes(new Set<string>());
            loadData();
          } catch (err: any) {
            const errorMessage =
              err.response?.data?.message || err.message || '批量删除失败';
            showToast(errorMessage, 'error');
          }
        },
        permanently ? 'danger' : 'warning'
      );
    },
    [selectedNodes, nodes, showConfirm, loadData, showToast]
  );

  // 进入文件夹
  const handleEnterFolder = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        navigate(`/projects/${urlProjectId}/files/${node.id}`);
      }
    },
    [navigate, urlProjectId]
  );

  // 处理文件打开（包括CAD文件跳转到编辑器）
  const handleFileOpen = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        // 如果是项目根目录（isRoot=true），使用 node.id 作为 projectId
        // 如果是普通文件夹，使用 URL 中的 projectId
        const effectiveProjectId = node.isRoot ? node.id : urlProjectId;
        navigate(`/projects/${effectiveProjectId}/files/${node.id}`);
      } else {
        // 检查是否是CAD文件
        const cadExtensions = ['.dwg', '.dxf'];
        if (
          node.extension &&
          cadExtensions.includes(node.extension.toLowerCase())
        ) {
          // 跳转到CAD编辑器，传递项目上下文
          const effectiveProjectId = node.isRoot ? node.id : urlProjectId;
          const queryParams = new URLSearchParams();
          // 后端 buildContextFromRequest 期望 nodeId 参数
          queryParams.set(
            'nodeId',
            currentNode?.id || effectiveProjectId || ''
          );
          navigate(`/cad-editor/${node.id}?${queryParams.toString()}`);
        } else {
          // 非CAD文件，执行下载
          handleDownload(node);
        }
      }
    },
    [navigate, urlProjectId, currentNode]
  );

  // 文件下载
  const handleDownload = useCallback(
    async (node: FileSystemNode) => {
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
        const errorMessage =
          err.response?.data?.message || err.message || '文件下载失败';
        showToast(errorMessage, 'error');
      }
    },
    [showToast]
  );

  // 打开重命名对话框
  const handleOpenRename = useCallback((node: FileSystemNode) => {
    setEditingNode(node);
    setFolderName(node.name);
    setShowRenameModal(true);
  }, []);

  // 项目相关操作
  const handleCreateProject = useCallback(
    async (name: string, description?: string) => {
      try {
        await projectsApi.create({
          name: name.trim(),
          description: description?.trim(),
        });
        showToast('项目创建成功', 'success');
        loadData();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || '创建项目失败';
        showToast(errorMessage, 'error');
        throw err;
      }
    },
    [loadData, showToast]
  );

  const handleUpdateProject = useCallback(
    async (id: string, data: { name?: string; description?: string }) => {
      try {
        await projectsApi.update(id, data);
        showToast('项目更新成功', 'success');
        loadData();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || '更新项目失败';
        showToast(errorMessage, 'error');
        throw err;
      }
    },
    [loadData, showToast]
  );

  const handleDeleteProject = useCallback(
    async (id: string, name: string) => {
      try {
        await projectsApi.delete(id);
        showToast('项目删除成功', 'success');
        loadData();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || '删除项目失败';
        showToast(errorMessage, 'error');
        throw err;
      }
    },
    [loadData, showToast]
  );

  // 项目过滤
  const getFilteredProjects = useCallback(() => {
    return nodes.filter((node) => {
      const matchesSearch =
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.description &&
          node.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [nodes, searchQuery]);

  // 进入项目
  const handleEnterProject = useCallback(
    (projectId: string) => {
      navigate(`/projects/${projectId}/files`);
    },
    [navigate]
  );

  // 显示项目成员
  const handleShowMembers = useCallback((node: FileSystemNode) => {
    // 成员管理功能由父组件处理
  }, []);

  // 添加初始加载和参数变化监听
  useEffect(() => {
    loadData();
  }, [urlProjectId, urlNodeId, refreshCount, loadData]);

  return {
    // 模式状态
    isProjectRootMode,
    isFolderMode,

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
    isMultiSelectMode,
    setIsMultiSelectMode,
    toasts,
    confirmDialog,
    showCreateFolderModal,
    showRenameModal,
    folderName,
    setFolderName,
    editingNode,

    // 拖拽状态
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,

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

    // 项目相关操作
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    getFilteredProjects,
    handleEnterProject,
    handleShowMembers,

    // 回收站相关操作
    trashApi,
  };
};
