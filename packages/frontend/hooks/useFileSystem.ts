import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { projectsApi, filesApi, trashApi } from '../services/apiService';
import { FileSystemNode, BreadcrumbItem } from '../types/filesystem';
import { ToastType, Toast } from '../components/ui/Toast';
import { PaginationMeta } from '../components/ui/Pagination';

/**
 * 验证文件夹/文件名称
 * 返回验证结果和错误消息
 */
const validateFolderName = (
  name: string
): { valid: boolean; error?: string } => {
  const trimmedName = name.trim();

  // 检查空值
  if (!trimmedName) {
    return { valid: false, error: '名称不能为空' };
  }

  // 检查长度限制（Windows 限制为 255 字符）
  if (trimmedName.length > 255) {
    return { valid: false, error: '名称长度不能超过 255 个字符' };
  }

  // 检查非法字符
  const illegalChars = /[<>:"|?*/\\]/;
  if (illegalChars.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符：< > : " | ? * / \\' };
  }

  // 检查控制字符
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/u.test(trimmedName)) {
    return { valid: false, error: '名称包含非法字符' };
  }

  // 检查保留名称（Windows）
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(trimmedName)) {
    return { valid: false, error: '该名称为系统保留名称' };
  }

  // 检查是否以点开头或结尾（Unix 隐藏文件）
  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: '名称不能以点开头或结尾' };
  }

  return { valid: true };
};

/**
 * 清理文件名，防止 XSS 攻击
 * 移除或转义危险字符，保留安全的文件名字符
 */
const sanitizeFileName = (fileName: string): string => {
  // 移除路径遍历字符
  let sanitized = fileName.replace(/[/\\]/g, '_');
  // 移除控制字符
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/gu, '');
  // 移除 HTML/JS 特殊字符（防止 XSS）
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  // 限制文件名长度（Windows 限制为 255 字符）
  if (sanitized.length > 250) {
    const ext = sanitized.split('.').pop() || '';
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, 250 - ext.length - 1) + '.' + ext;
  }
  return sanitized || 'unnamed';
};

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
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(
    null
  );

  // 使用 ref 存储最新的 pagination 值，避免闭包问题
  const paginationRef = useRef(pagination);

  // 同步更新 ref
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  // 使用 ref 标志来控制是否应该加载数据，避免循环调用
  const shouldLoadDataRef = useRef(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false); // 多选模式开关

  // 跟踪上一次点击的节点，用于 Shift+点击范围选择
  const lastSelectedNodeIdRef = useRef<string | null>(null);
  const lastSelectedIndexRef = useRef<number>(-1);

  // 拖拽状态
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const [refreshCount, setRefreshCount] = useState(0);

  // 跟踪上一次的值，防止重复调用
  // 初始值设为 null，确保首次加载时能正确触发
  const prevParamsRef = useRef<{
    urlProjectId: string;
    urlNodeId: string | undefined;
    refreshCount: number;
  } | null>(null);

  // 标志：是否已经完成初始加载
  const hasInitialLoadedRef = useRef(false);

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingNode, setEditingNode] = useState<FileSystemNode | null>(null);
  const [folderName, setFolderName] = useState('');

  const [toasts, setToasts] = useState<Toast[]>([]);

  // 存储所有定时器 ID，用于组件卸载时清理
  const timerRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  // 存储 AbortController，用于取消网络请求
  const abortControllerRef = useRef<AbortController | null>(null);

  // 组件卸载时清理所有定时器和取消网络请求
  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);

    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timerRefs.current.delete(timerId);
    }, 5000);
    timerRefs.current.add(timerId);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

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

  // 刷新操作 - 使用 forceRefresh 确保获取最新 URL 参数
  const handleRefresh = useCallback(() => {
    // 增加计数器，强制 useEffect 重新执行 loadData
    // 这样可以确保 loadData 使用最新的 projectId 和 nodeId
    setRefreshCount((prev) => prev + 1);
  }, []);

  // 从节点构建面包屑
  const buildBreadcrumbsFromNode = useCallback(
    async (node: FileSystemNode, signal?: AbortSignal) => {
      const crumbs: BreadcrumbItem[] = [];
      const visited = new Set<string>();
      let currentNode: FileSystemNode | null = node;

      try {
        // 向上遍历构建面包屑
        while (currentNode && !visited.has(currentNode.id)) {
          // 检查是否已取消
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }

          visited.add(currentNode.id);
          crumbs.unshift({
            id: currentNode.id,
            name: currentNode.name,
            isRoot: currentNode.isRoot,
          });

          if (currentNode.parentId) {
            const parentResponse = await projectsApi.getNode(
              currentNode.parentId,
              { signal }
            );
            currentNode = parentResponse.data;
          } else {
            break;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (error) {
        // 如果是取消请求导致的错误，不处理
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }

        // 构建面包屑失败，至少显示当前节点
        setBreadcrumbs([
          {
            id: node.id,
            name: node.name,
            isRoot: node.isRoot,
          },
        ]);
      }
    },
    []
  );

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
    console.log('[useFileSystem] loadData 开始', {
      urlProjectId,
      urlNodeId,
      isProjectRootMode,
      searchQuery,
      pagination: paginationRef.current,
      timestamp: Date.now(),
    });

    // 取消之前的请求
    if (abortControllerRef.current) {
      console.log('[useFileSystem] 取消之前的请求');
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    setSelectedNodes(new Set<string>()); // 清除选中状态
    setIsMultiSelectMode(false); // 清除多选模式

    try {
      // 构建请求参数
      const params: any = {
        page: paginationRef.current.page,
        limit: paginationRef.current.limit,
      };

      // 如果有搜索查询，添加到参数中
      if (searchQuery) {
        params.search = searchQuery;
      }

      if (isProjectRootMode) {
        // 项目根目录模式：加载项目列表
        const response = await projectsApi.list({
          params,
          signal: abortController.signal,
        });

        // 处理分页响应
        if (response.data?.data) {
          setNodes(response.data.data);
          setPaginationMeta(response.data.meta);
        } else {
          // 兼容旧格式（如果后端还未更新）
          const allProjects = response.data || [];
          setNodes(allProjects);
          setPaginationMeta({
            total: allProjects.length,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
            totalPages: Math.ceil(
              allProjects.length / paginationRef.current.limit
            ),
          });
        }

        setCurrentNode(null);
        setBreadcrumbs([]);
      } else {
        // 文件夹模式：加载项目/文件夹内容
        const currentNodeId = urlNodeId || urlProjectId;
        const [nodeResponse, childrenResponse] = await Promise.all([
          projectsApi.getNode(currentNodeId, {
            signal: abortController.signal,
          }),
          projectsApi.getChildren(currentNodeId, {
            params,
            signal: abortController.signal,
          }),
        ]);
        const nodeData = nodeResponse.data;

        // 处理分页响应
        if (childrenResponse.data?.data) {
          setNodes(childrenResponse.data.data);
          setPaginationMeta(childrenResponse.data.meta);
        } else {
          // 兼容旧格式（如果后端还未更新）
          const childrenData = childrenResponse.data || [];
          setNodes(childrenData);
          setPaginationMeta({
            total: childrenData.length,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
            totalPages: Math.ceil(
              childrenData.length / paginationRef.current.limit
            ),
          });
        }

        setCurrentNode(nodeData);

        // 后端已返回外部参照状态信息，直接使用（避免重复请求 preloading 接口）

        // 构建面包屑
        await buildBreadcrumbsFromNode(nodeData, abortController.signal);
      }
    } catch (error) {
      // 如果是取消请求导致的错误，不处理
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useFileSystem] 请求被取消 (AbortError)', {
          urlProjectId,
          urlNodeId,
          timestamp: Date.now(),
        });
        return;
      }

      console.error('[useFileSystem] 加载数据失败', {
        error,
        urlProjectId,
        urlNodeId,
        timestamp: Date.now(),
      });

      const errorMessage =
        error instanceof Error ? error.message : '加载数据失败';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      console.log('[useFileSystem] loadData 完成', {
        urlProjectId,
        urlNodeId,
        timestamp: Date.now(),
      });
      setLoading(false);
    }
  }, [
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    searchQuery,
    showToast,
    buildBreadcrumbsFromNode,
  ]);

  // 使用 ref 存储 loadData 的最新版本，确保 useEffect 使用最新的函数
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

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
    (
      nodeId: string,
      isMultiSelect: boolean = false,
      isShift: boolean = false
    ) => {
      setSelectedNodes((prev) => {
        const newSet = new Set(prev);

        // 查找当前节点在列表中的索引
        const currentIndex = nodes.findIndex((node) => node.id === nodeId);

        if (
          isShift &&
          lastSelectedNodeIdRef.current &&
          lastSelectedIndexRef.current !== -1
        ) {
          // Shift+点击：范围选择
          const lastIndex = lastSelectedIndexRef.current;
          const startIndex = Math.min(lastIndex, currentIndex);
          const endIndex = Math.max(lastIndex, currentIndex);

          // 清除之前的选中（如果不在多选模式）
          if (!isMultiSelectMode) {
            newSet.clear();
          }

          // 选择范围内的所有节点
          for (let i = startIndex; i <= endIndex; i++) {
            newSet.add(nodes[i].id);
          }

          // 更新最后选中的节点
          lastSelectedNodeIdRef.current = nodeId;
          lastSelectedIndexRef.current = currentIndex;
        } else if (isMultiSelect) {
          // Ctrl+点击：多选模式 toggle
          if (newSet.has(nodeId)) {
            newSet.delete(nodeId);
            // 如果取消选中的是最后一个选中的节点，重置最后选中的索引
            if (lastSelectedNodeIdRef.current === nodeId) {
              lastSelectedNodeIdRef.current = null;
              lastSelectedIndexRef.current = -1;
            }
          } else {
            newSet.add(nodeId);
            lastSelectedNodeIdRef.current = nodeId;
            lastSelectedIndexRef.current = currentIndex;
          }
        } else {
          // 单选模式：只选中当前
          newSet.clear();
          newSet.add(nodeId);
          lastSelectedNodeIdRef.current = nodeId;
          lastSelectedIndexRef.current = currentIndex;
        }

        return newSet;
      });
    },
    [nodes, isMultiSelectMode]
  );

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    const allNodeIds = nodes.map((node) => node.id);

    if (selectedNodes.size === allNodeIds.length) {
      // 如果已全选，则取消全选
      setSelectedNodes(new Set());
      lastSelectedNodeIdRef.current = null;
      lastSelectedIndexRef.current = -1;
    } else {
      // 否则全选
      setSelectedNodes(new Set(allNodeIds));
      // 设置最后选中的节点为第一个节点
      if (allNodeIds.length > 0) {
        lastSelectedNodeIdRef.current = allNodeIds[0];
        lastSelectedIndexRef.current = 0;
      }
    }
  }, [nodes, selectedNodes.size]);

  // 键盘快捷键：Ctrl+A 全选
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A 或 Cmd+A (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // 只在多选模式下响应
        if (!isMultiSelectMode) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        handleSelectAll();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMultiSelectMode, handleSelectAll]);

  // 创建文件夹
  const handleCreateFolder = useCallback(async () => {
    if (!urlProjectId) {
      showToast('项目 ID 不能为空', 'error');
      return null;
    }

    // 验证文件夹名称
    const validation = validateFolderName(folderName);
    if (!validation.valid) {
      showToast(validation.error || '文件夹名称无效', 'error');
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
    } catch (error) {
      let errorMessage = '创建文件夹失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error
      ) {
        const err = error as { response?: { data?: { message?: string } } };
        errorMessage = err.response?.data?.message || errorMessage;
      }
      showToast(errorMessage, 'error');
      return null;
    }
  }, [folderName, urlProjectId, currentNode, loadData, showToast]);

  // 重命名
  const handleRename = useCallback(async () => {
    if (!editingNode || !urlProjectId) {
      showToast('参数错误', 'error');
      return;
    }

    // 验证新名称
    const validation = validateFolderName(folderName);
    if (!validation.valid) {
      showToast(validation.error || '名称无效', 'error');
      return;
    }

    try {
      let finalName = folderName.trim();

      // 对于文件节点，自动添加原扩展名
      if (!editingNode.isFolder && editingNode.name) {
        const lastDotIndex = editingNode.name.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          const originalExtension = editingNode.name.substring(lastDotIndex);
          finalName = `${finalName}${originalExtension}`;
        }
      }

      await projectsApi.updateNode(editingNode.id, { name: finalName });
      showToast('重命名成功', 'success');
      setFolderName('');
      setShowRenameModal(false);
      setEditingNode(null);
      loadData();
    } catch (error) {
      let errorMessage = '重命名失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error
      ) {
        const err = error as { response?: { data?: { message?: string } } };
        errorMessage = err.response?.data?.message || errorMessage;
      }
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
          } catch (error) {
            let errorMessage = '删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (
              typeof error === 'object' &&
              error !== null &&
              'response' in error
            ) {
              const err = error as {
                response?: { data?: { message?: string } };
              };
              errorMessage = err.response?.data?.message || errorMessage;
            }
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
          } catch (error) {
            let errorMessage = '批量删除失败';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (
              typeof error === 'object' &&
              error !== null &&
              'response' in error
            ) {
              const err = error as {
                response?: { data?: { message?: string } };
              };
              errorMessage = err.response?.data?.message || errorMessage;
            }
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
          const queryParams = new URLSearchParams();
          // nodeId: 图纸的父节点 ID（用于上传时确定目标目录）
          queryParams.set('nodeId', node.parentId || '');
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
      try {
        console.log('[useFileSystem] 开始下载文件', {
          nodeId: node.id,
          fileName: node.name,
          isFolder: node.isFolder,
        });

        const response = await filesApi.download(node.id);
        const blob = new Blob([response.data]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 使用清理后的文件名，防止 XSS 攻击
        const fileName = node.originalName || node.name;
        // 如果是文件夹，添加 .zip 扩展名
        const finalFileName = node.isFolder
          ? `${sanitizeFileName(fileName)}.zip`
          : sanitizeFileName(fileName);
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        console.log('[useFileSystem] 下载成功', { fileName: finalFileName });
        showToast(
          node.isFolder ? '目录压缩下载成功' : '文件下载成功',
          'success'
        );
      } catch (error) {
        console.error('[useFileSystem] 下载失败', error);

        let errorMessage = '文件下载失败';

        if (error instanceof Error) {
          // 检查是否是 CORS 错误
          if (
            error.message.includes('CORS') ||
            error.message.includes('Network Error')
          ) {
            errorMessage =
              '下载失败：跨域请求被阻止，请检查浏览器插件或尝试禁用迅雷插件';
          } else {
            errorMessage = error.message;
          }
        }

        showToast(errorMessage, 'error');
      }
    },
    [showToast]
  );

  // 打开重命名对话框
  const handleOpenRename = useCallback((node: FileSystemNode) => {
    setEditingNode(node);

    // 对于文件，只提取文件名部分（不包含扩展名）
    if (!node.isFolder && node.name) {
      const lastDotIndex = node.name.lastIndexOf('.');
      const nameWithoutExtension =
        lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
      setFolderName(nameWithoutExtension);
    } else {
      // 文件夹或没有扩展名的文件，使用完整名称
      setFolderName(node.name);
    }

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
      } catch (error) {
        let errorMessage = '创建项目失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error
        ) {
          const err = error as { response?: { data?: { message?: string } } };
          errorMessage = err.response?.data?.message || errorMessage;
        }
        showToast(errorMessage, 'error');
        throw error;
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
      } catch (error) {
        let errorMessage = '更新项目失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error
        ) {
          const err = error as { response?: { data?: { message?: string } } };
          errorMessage = err.response?.data?.message || errorMessage;
        }
        showToast(errorMessage, 'error');
        throw error;
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
      } catch (error) {
        let errorMessage = '删除项目失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error
        ) {
          const err = error as { response?: { data?: { message?: string } } };
          errorMessage = err.response?.data?.message || errorMessage;
        }
        showToast(errorMessage, 'error');
        throw error;
      }
    },
    [loadData, showToast]
  );

  // 搜索输入处理
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    // 搜索时重置页码到第一页
    setPagination({ ...paginationRef.current, page: 1 });
  }, []);

  // 搜索提交
  const handleSearchSubmit = useCallback(() => {
    // 直接调用 loadData，它会自动处理搜索参数
    loadData();
  }, [loadData]);

  // 页码变化处理
  const handlePageChange = useCallback((newPage: number) => {
    // 先更新 ref，确保 loadData 使用最新的值
    paginationRef.current = { ...paginationRef.current, page: newPage };
    // 设置标志，表示应该加载数据
    shouldLoadDataRef.current = true;
    // 更新状态
    setPagination(paginationRef.current);
  }, []);

  // 每页显示数量变化处理
  const handlePageSizeChange = useCallback((newPageSize: number) => {
    // 先更新 ref，确保 loadData 使用最新的值
    paginationRef.current = { page: 1, limit: newPageSize };
    // 设置标志，表示应该加载数据
    shouldLoadDataRef.current = true;
    // 更新状态
    setPagination(paginationRef.current);
  }, []);

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
    const currentParams = {
      urlProjectId,
      urlNodeId,
      refreshCount,
    };

    console.log('[useFileSystem] useEffect 触发', {
      currentParams,
      prevParams: prevParamsRef.current,
      pathname: location.pathname,
      timestamp: Date.now(),
    });

    // 检查参数是否真正变化
    // 如果 prevParamsRef.current 为 null，说明是首次加载，应该加载数据
    const hasChanged =
      prevParamsRef.current === null ||
      prevParamsRef.current.urlProjectId !== currentParams.urlProjectId ||
      prevParamsRef.current.urlNodeId !== currentParams.urlNodeId ||
      prevParamsRef.current.refreshCount !== currentParams.refreshCount;

    // 如果参数未变化，跳过
    if (!hasChanged) {
      console.log('[useFileSystem] 参数未变化，跳过 loadData');
      return;
    }

    // 更新 ref
    prevParamsRef.current = currentParams;

    // 当 urlProjectId 或 urlNodeId 变化时，重置页码到第一页
    setPagination((prev) => ({ ...prev, page: 1 }));

    // 使用防抖，避免短时间内多次调用
    const timeoutId = setTimeout(() => {
      console.log('[useFileSystem] 执行 loadData', {
        urlProjectId,
        urlNodeId,
        refreshCount,
        timestamp: Date.now(),
      });
      loadData();
    }, 150); // 增加防抖时间到 150ms

    return () => {
      console.log('[useFileSystem] 清理 timeout', {
        urlProjectId,
        urlNodeId,
        refreshCount,
        timestamp: Date.now(),
      });
      clearTimeout(timeoutId);
    };
  }, [urlProjectId, urlNodeId, refreshCount]); // 移除 location.pathname

  // 监听 pagination 变化，当标志为 true 时加载数据
  useEffect(() => {
    console.log('[useFileSystem] pagination useEffect', {
      pagination,
      shouldLoadData: shouldLoadDataRef.current,
      timestamp: Date.now(),
    });

    if (shouldLoadDataRef.current) {
      // 清除标志
      shouldLoadDataRef.current = false;
      console.log('[useFileSystem] pagination 变化，执行 loadData');
      // 加载数据（使用 ref 获取最新的函数）
      loadDataRef.current();
    }
  }, [pagination]);

  // 监听 searchQuery 变化，当搜索清空时自动加载数据
  const prevSearchQueryRef = useRef('');
  useEffect(() => {
    if (searchQuery === '' && prevSearchQueryRef.current !== '') {
      // 搜索清空时，重置页码并加载数据
      console.log('[useFileSystem] 搜索清空，重新加载数据');
      setPagination((prev) => ({ ...prev, page: 1 }));
      // 延迟加载数据，避免与主 useEffect 冲突
      setTimeout(() => {
        console.log('[useFileSystem] 搜索清空后执行 loadData');
        loadDataRef.current();
      }, 200);
    }
    prevSearchQueryRef.current = searchQuery;
  }, [searchQuery]);

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
    setSearchQuery: handleSearchChange,
    handleSearchSubmit,
    pagination,
    setPagination,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
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
    handleEnterProject,
    handleShowMembers,

    // 回收站相关操作
    trashApi,
  };
};
