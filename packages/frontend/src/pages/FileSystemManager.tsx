///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useNavigate,
  useParams,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToastContainer } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import MxCadUploader, { MxCadUploaderRef } from '@/components/MxCadUploader';
import MxCadUppyUploader, { MxCadUppyUploaderRef } from '@/components/MxCadUppyUploader';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { FileItem } from '@/components/FileItem';
import { useFileSystem } from '@/hooks/file-system';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { usePermission } from '@/hooks/usePermission';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import { useAuth } from '@/contexts/AuthContext';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import {
  fileSystemControllerUpdateNode,
  fileSystemControllerCreateProject,
  fileSystemControllerGetPersonalSpace,
  fileSystemControllerGetStorageQuota,
  fileSystemControllerUpdateStorageQuota,
  fileSystemControllerMoveNode,
  fileSystemControllerCopyNode,
} from '@/api-sdk';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  FileSystemToolbar,
  BatchActionsBar,
  ProjectFilterTabs,
} from '@/pages/components';
import {
  EmptyFolderIcon,
  RefreshIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
} from '@/components/FileIcons';
import { FileSystemNode } from '@/types/filesystem';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { RenameModal } from '@/components/modals/RenameModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { versionControlApi } from '@/services/versionControlApi';
import { ProjectPermission } from '@/constants/permissions';
import { isAbortError, handleError } from '@/utils/errorHandler';
import type { ProjectFilterType } from '@/services/projectApi';

interface FileSystemManagerProps {
  mode?: 'project' | 'personal-space';
}

export const FileSystemManager: React.FC<FileSystemManagerProps> = ({
  mode = 'project',
}) => {
  useDocumentTitle(mode === 'personal-space' ? '我的图纸' : '项目管理');
  const navigate = useNavigate();
  const params = useParams<{ projectId: string; nodeId?: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // 项目过滤状态：区分"我创建的"和"我加入的"项目
  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');

  // 私人空间状态 - 使用 store 缓存
  const {
    personalSpaceId,
    personalSpaceIdLoading,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
  } = useFileSystemStore();

  // 上传组件 ref
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  // 面包屑滚动容器 ref
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  // 文件系统核心 hooks
  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
    viewMode,
    setViewMode,
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    toasts,
    confirmDialog,
    showToast,
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,
    showCreateFolderModal,
    showRenameModal,
    showDownloadFormatModal,
    folderName,
    setFolderName,
    editingNode,
    downloadingNode,
    setShowCreateFolderModal,
    setShowRenameModal,
    setShowDownloadFormatModal,
    setEditingNode,
    setDownloadingNode,
    removeToast,
    closeConfirm,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
    handleOpenRename,
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    isTrashView,
    setIsTrashView,
    handleToggleTrashView,
    handleRestoreNode,
    handleClearProjectTrash,
    handleBatchRestore,
    isProjectTrashView,
    handleToggleProjectTrashView,
    handleClearTrash,
  } = useFileSystem({
    mode,
    personalSpaceId,
    projectFilter,
  });

  // 项目管理 hooks
  const {
    isModalOpen: isProjectModalOpen,
    editingProject,
    setEditingProject,
    formData: projectFormData,
    loading: projectLoading,
    openCreateModal: openCreateProject,
    openEditModal: openEditProject,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleCreate: handleCreateProjectSubmit,
    handleUpdate: handleUpdateProjectSubmit,
    // 删除确认模态框
    deleteConfirmOpen,
    projectToDelete,
    confirmDelete,
    cancelDelete,
  } = useProjectManagement({
    onProjectCreated: handleRefresh,
    onProjectUpdated: handleRefresh,
    onProjectDeleted: handleRefresh,
    showToast,
  });

  // 获取私人空间 ID 失败次数（避免无限重试）
  const [personalSpaceErrorCount, setPersonalSpaceErrorCount] = useState(0);
  const MAX_RETRY_COUNT = 3;

  // 获取私人空间 ID（使用缓存，避免每次进入都重新获取）
  useEffect(() => {
    if (mode !== 'personal-space') return;

    // 已有缓存，直接使用
    if (personalSpaceId) {
      return;
    }

    // 正在加载中，避免重复请求
    if (personalSpaceIdLoading) {
      return;
    }

    // 超过最大重试次数，停止请求
    if (personalSpaceErrorCount >= MAX_RETRY_COUNT) {
      showToast('获取私人空间失败，请刷新页面重试', 'error');
      return;
    }

    const fetchPersonalSpace = async () => {
      setPersonalSpaceIdLoading(true);
      try {
        const { data: response } = await fileSystemControllerGetPersonalSpace();
        if (response?.id) {
          setPersonalSpaceId(response.id);
          setPersonalSpaceErrorCount(0); // 成功则重置错误计数
        }
      } catch (error) {
        // 检测请求是否被取消（用户切换页面时正常行为）
        if (isAbortError(error)) {
          return;
        }

        handleError(error, '获取私人空间失败');
        setPersonalSpaceErrorCount((prev) => prev + 1);
        showToast(
          `获取私人空间失败 (${personalSpaceErrorCount + 1}/${MAX_RETRY_COUNT})`,
          'error'
        );
      } finally {
        setPersonalSpaceIdLoading(false);
      }
    };

    fetchPersonalSpace();
  }, [
    mode,
    personalSpaceId,
    personalSpaceIdLoading,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
    showToast,
    personalSpaceErrorCount,
  ]);

  // 权限管理 hook
  const { hasPermission } = usePermission();
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);

  // 所有用户都可以创建项目，不需要权限检查
  const canCreateProject = true;

  // 权限状态（用于根节点/项目列表的权限）
  const [nodePermissions, setNodePermissions] = useState<
    Map<
      string,
      {
        canEdit: boolean;
        canDelete: boolean;
        canManageMembers: boolean;
        canManageRoles: boolean;
      }
    >
  >(new Map());

  // 权限加载状态
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // 项目文件权限（使用统一的权限加载 Hook）
  const { permissions: projectPermissions } =
    useProjectPermissions(urlProjectId);

  // 移动/拷贝状态（支持批量操作标记）
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);
  const [copySourceNode, setCopySourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);

  // 版本历史相关状态
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistoryNode, setVersionHistoryNode] =
    useState<FileSystemNode | null>(null);
  const [versionHistoryEntries, setVersionHistoryEntries] = useState<
    { revision: number; author: string; date: string; message: string }[]
  >([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(
    null
  );

  // 是否在根级别（无 projectId）
  // 私人空间模式下始终为 false，因为有私人空间 ID 作为根目录
  const isAtRoot = mode === 'personal-space' ? false : !urlProjectId;

  // 面包屑滚轮横向滚动处理
  useEffect(() => {
    const container = breadcrumbRef.current;
    if (!container) return;

    const SCROLL_SPEED = 0.5;
    const MAX_DELTA = 50;

    const handleWheel = (e: WheelEvent) => {
      if (!container.contains(e.target as Node)) return;
      if (e.deltaX !== 0) return;

      if (e.deltaY !== 0) {
        e.preventDefault();
        const delta =
          Math.sign(e.deltaY) *
          Math.min(Math.abs(e.deltaY) * SCROLL_SPEED, MAX_DELTA);
        container.scrollLeft += delta;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // 面包屑更新时滚动到最后
  useEffect(() => {
    if (breadcrumbRef.current && breadcrumbs.length > 0) {
      breadcrumbRef.current.scrollTo({
        left: breadcrumbRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [breadcrumbs]);

  // 直接使用后端返回的数据（已包含分页和搜索）
  // 不再进行前端过滤，避免破坏分页的正确性
  // 确保 displayNodes 始终是数组，防止 map 错误
  const displayNodes = Array.isArray(nodes) ? nodes : [];

  // 获取当前正确的父节点 ID（上传目标目录）
  // 使用 ref 缓存最新值，避免闭包问题
  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    // 优先使用 ref 中的最新值（实时更新）
    if (currentNodeIdRef.current) {
      return currentNodeIdRef.current;
    }

    // 备用方案：使用 URL 参数
    // 优先使用 URL nodeId（最可靠，因为 URL 是页面状态的权威来源）
    if (urlNodeId) {
      return urlNodeId;
    }

    // 如果 URL nodeId 存在但 nodes 已加载，验证节点是否存在
    if (urlNodeId && nodes.length > 0) {
      const currentNodeData = nodes.find((n) => n.id === urlNodeId);
      if (currentNodeData) {
        return currentNodeData.id;
      }
    }

    // 最后使用 projectId（项目根目录）
    if (urlProjectId) {
      return urlProjectId;
    }

    return '';
  }, [urlNodeId, urlProjectId, nodes]);

  // 当 currentNode 变化时，更新 ref
  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
    }
  }, [currentNode]);

  // 加载节点权限信息
  useEffect(() => {
    if (!user) return;

    // 确定需要加载权限的节点列表
    let nodesToLoad: string[] = [];

    if (isAtRoot) {
      // 项目列表页面：为所有项目根节点加载权限
      nodesToLoad = displayNodes
        .filter((node) => node.isRoot)
        .map((node) => node.id);
    } else if (urlProjectId) {
      // 项目内部页面：为当前项目加载权限
      nodesToLoad = [urlProjectId];
    }

    if (nodesToLoad.length === 0) return;

    const loadPermissions = async () => {
      setPermissionsLoading(true);

      try {
        const {
          canEditNode,
          canDeleteNode,
          canManageNodeMembers,
          canManageNodeRoles,
        } = await import('@/utils/permissionUtils');

        // 并行加载所有节点的权限
        const permissionsPromises = nodesToLoad.map(async (nodeId) => {
          const [canEdit, canDelete, canManageMembers, canManageRoles] =
            await Promise.all([
              canEditNode(user, nodeId),
              canDeleteNode(user, nodeId),
              canManageNodeMembers(user, nodeId),
              canManageNodeRoles(user, nodeId),
            ]);

          return {
            nodeId,
            canEdit,
            canDelete,
            canManageMembers,
            canManageRoles,
          };
        });

        const permissionsResults = await Promise.all(permissionsPromises);

        setNodePermissions((prev) => {
          const newMap = new Map(prev);

          permissionsResults.forEach((result) => {
            newMap.set(result.nodeId, {
              canEdit: result.canEdit,
              canDelete: result.canDelete,
              canManageMembers: result.canManageMembers,
              canManageRoles: result.canManageRoles,
            });
          });

          return newMap;
        });
      } catch (error) {
        handleError(error, '加载权限信息失败');
      } finally {
        setPermissionsLoading(false);
      }
    };

    loadPermissions();
  }, [user, isAtRoot, urlProjectId, nodes.length]);

  // 处理从仪表盘点击"上传图纸"跳转过来的 action=upload 参数
  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'upload' || isAtRoot || loading) return;

    // 延迟触发上传，确保组件已完全渲染
    const timer = setTimeout(() => {
      if (uploaderRef.current) {
        uploaderRef.current.triggerUpload();
        // 清除 URL 参数，避免刷新后重复触发
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('action');
        navigate({ search: newSearchParams.toString() }, { replace: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchParams, isAtRoot, loading, navigate]);

  // 打开成员管理模态框
  const handleShowMembers = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsMembersModalOpen(true);
  }, []);

  // 打开项目角色管理模态框
  const handleShowRoles = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsProjectRolesModalOpen(true);
  }, []);

  // 提交项目表单
  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editingProject) {
        handleUpdateProjectSubmit(async (id, data) => {
          // TODO: Replace with SDK when backend adds updateProject endpoint
          await fileSystemControllerUpdateNode({ path: { nodeId: id }, body: { name: data.name ?? undefined, description: data.description } } as any);
        });
      } else {
        handleCreateProjectSubmit(async (name, description) => {
          await fileSystemControllerCreateProject({ body: { name, description } } as any);
        });
      }
    },
    [editingProject, handleCreateProjectSubmit, handleUpdateProjectSubmit]
  );

  /**
   * 处理上传外部参照（任务009 - 快捷键支持）
   * 获取当前选中的 CAD 文件并触发上传
   */
  const handleUploadExternalReference = useCallback((node: FileSystemNode) => {
    // 检查是否为 CAD 文件
    const ext = node.extension?.toLowerCase();
    if (ext !== '.dwg' && ext !== '.dxf') {
      return;
    }

    // 外部参照上传逻辑已在 FileItem 组件中实现
  }, []);

  /**
   * 处理移动节点
   */
  const handleMove = useCallback((node: FileSystemNode) => {
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  /**
   * 处理复制节点
   */
  const handleCopy = useCallback((node: FileSystemNode) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  /**
   * 显示版本历史
   */
  const handleShowVersionHistory = useCallback(
    async (node: FileSystemNode) => {
      if (!projectPermissions[ProjectPermission.VERSION_READ]) {
        showToast('您没有权限查看版本历史', 'warning');
        return;
      }

      if (!node.path) {
        return;
      }

      setVersionHistoryNode(node);
      setShowVersionHistoryModal(true);
      setVersionHistoryLoading(true);
      setVersionHistoryError(null);

      try {
        const response = await versionControlApi.getFileHistory(
          urlProjectId || '',
          node.path,
          50
        );
        // apiClient.get 返回 AxiosResponse，响应拦截器解包后 response.data 是 { success: true, message: "获取成功", entries: [...] }
        if (response.data?.success) {
          setVersionHistoryEntries(response.data.entries || []);
        } else {
          setVersionHistoryError(response.data?.message || '加载版本历史失败');
        }
      } catch (error) {
        handleError(error, '版本历史加载失败');
        setVersionHistoryError(
          error instanceof Error ? error.message : '加载版本历史失败'
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [urlProjectId, projectPermissions]
  );

  /**
   * 打开历史版本编辑器
   */
  const handleOpenHistoricalVersion = useCallback(
    (revision: number) => {
      if (!versionHistoryNode?.path || !versionHistoryNode.id) {
        return;
      }

      // 在新标签页中打开历史版本编辑器
      // 同时传递 nodeId（父节点）和 v（版本号）参数
      const url = `/cad-editor/${versionHistoryNode.id}?nodeId=${versionHistoryNode.parentId}&v=${revision}`;
      window.open(url, '_blank');
    },
    [versionHistoryNode]
  );

  /**
   * 确认移动/拷贝
   */
  const handleConfirmMoveOrCopy = useCallback(
    async (targetParentId: string) => {
      try {
        // 批量模式
        if (isMultiSelectMode && selectedNodes.size > 0) {
          const nodeIds = Array.from(selectedNodes) as string[];
          for (const nodeId of nodeIds) {
            // 判断是移动还是复制
            if (moveSourceNode) {
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId } } as any);
            } else {
              await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId } } as any);
            }
          }
        }
        // 单个节点模式
        else if (moveSourceNode) {
          await fileSystemControllerMoveNode({ path: { nodeId: moveSourceNode.id }, body: { targetParentId } } as any);
        } else if (copySourceNode) {
          await fileSystemControllerCopyNode({ path: { nodeId: copySourceNode.id }, body: { targetParentId } } as any);
        }
        handleRefresh();
        setShowSelectFolderModal(false);
        setMoveSourceNode(null);
        setCopySourceNode(null);
      } catch (error) {
        const errorMessage = (error as Error).message || '操作失败，请重试';
        showToast(errorMessage, 'error');
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      isMultiSelectMode,
      selectedNodes,
      handleRefresh,
    ]
  );

  /**
   * 处理拖拽开始
   */
  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      if (node.isRoot) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'copyMove';
      setDraggedNodes([node]);
    },
    []
  );

  /**
   * 处理拖拽经过
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      e.preventDefault();
      if (node.isFolder && node.id !== draggedNodes[0]?.id) {
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        setDropTargetId(node.id);
      }
    },
    [draggedNodes]
  );

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  /**
   * 处理拖拽放置
   */
  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: FileSystemNode) => {
      e.preventDefault();
      setDropTargetId(null);

      if (!targetNode.isFolder) return;
      if (draggedNodes.length === 0) return;

      // 检查是否拖拽到自身或其子节点
      const draggedNode = draggedNodes[0];
      if (!draggedNode) return;
      const draggedNodeId = draggedNode.id;
      if (draggedNodeId === targetNode.id) return;

      // 判断是移动还是复制（Ctrl 键按住 = 拷贝，否则 = 移动）
      const isCopy = e.ctrlKey || e.metaKey;

      try {
        if (isCopy) {
          await fileSystemControllerCopyNode({ path: { nodeId: draggedNodeId }, body: { targetParentId: targetNode.id } } as any);
        } else {
          await fileSystemControllerMoveNode({ path: { nodeId: draggedNodeId }, body: { targetParentId: targetNode.id } } as any);
        }
        handleRefresh();
      } catch (error) {
        const errorMessage = (error as Error).message || '操作失败，请重试';
        showToast(errorMessage, 'error');
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, handleRefresh]
  );

  // ========== 渲染函数 ==========

  // 项目过滤 Tab 配置
  const projectFilterTabs: { key: ProjectFilterType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'owned', label: '我创建的' },
    { key: 'joined', label: '我加入的' },
  ];

  const renderHeader = () => (
    <div
      className="backdrop-blur-xl rounded-2xl p-4 shadow-sm space-y-3"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={
              isPersonalSpaceMode
                ? isAtRoot
                  ? () => {
                      setSearchTerm('');
                      navigate('/personal-space');
                    }
                  : () => {
                      // 如果当前在回收站模式，点击返回时退出回收站
                      if (isTrashView) {
                        setIsTrashView(false);
                      } else {
                        setSearchTerm('');
                        handleGoBack();
                      }
                    }
                : isAtRoot
                  ? () => {
                      setSearchTerm('');
                      navigate('/projects');
                    }
                  : () => {
                      // 如果当前在回收站模式，点击返回时退出回收站
                      if (isTrashView) {
                        setIsTrashView(false);
                      } else {
                        setSearchTerm('');
                        handleGoBack();
                      }
                    }
            }
            className="p-2 rounded-xl transition-all flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
              e.currentTarget.style.background = 'transparent';
            }}
            title={
              isPersonalSpaceMode
                ? isAtRoot
                  ? '返回我的图纸'
                  : '返回上一级'
                : isAtRoot
                  ? '返回项目列表'
                  : '返回上一级'
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>

          <div
            ref={breadcrumbRef}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs}
              onNavigate={(crumb) => {
                // 清空搜索状态
                setSearchTerm('');
                // 如果当前在回收站模式，点击面包屑时退出回收站
                if (isTrashView) {
                  setIsTrashView(false);
                }
                if (isPersonalSpaceMode) {
                  // 私人空间模式下的导航
                  if (crumb.isRoot) {
                    navigate('/personal-space');
                  } else {
                    navigate(`/personal-space/${crumb.id}`);
                  }
                } else {
                  // 项目模式下的导航
                  if (crumb.isRoot) {
                    navigate(`/projects/${crumb.id}/files`);
                  } else {
                    navigate(`/projects/${params.projectId}/files/${crumb.id}`);
                  }
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            style={{ color: 'var(--text-tertiary)' }}
            className="hover:bg-[var(--bg-tertiary)]"
            title="刷新"
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </Button>

          {/* 回收站按钮 */}
          {!isAtRoot && (
            <Button
              variant={isTrashView ? 'primary' : 'ghost'}
              size="sm"
              onClick={handleToggleTrashView}
              disabled={loading}
              className={isTrashView ? '' : 'hover:bg-[var(--bg-tertiary)]'}
              style={isTrashView ? {} : { color: 'var(--text-tertiary)' }}
              title={isTrashView ? '返回文件列表' : '文件回收站'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mr-1"
              >
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              文件回收站
            </Button>
          )}

          {isAtRoot ? (
            <>
              {/* 私人空间模式或回收站视图不显示新建项目按钮 */}
              {canCreateProject &&
                !isPersonalSpaceMode &&
                !isProjectTrashView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openCreateProject}
                    className="hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="新建项目"
                    data-tour="create-project-btn"
                  >
                    <FolderPlus size={16} />
                  </Button>
                )}
            </>
          ) : (
            <>
              {/* 回收站视图不显示新建文件夹和上传文件按钮 */}
              {!isTrashView && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateFolderModal(true)}
                    disabled={loading}
                    className="hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="新建文件夹"
                    data-tour="create-folder-btn"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      <path d="M12 11v6M9 14h6" />
                    </svg>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!urlProjectId) {
                        showToast('请先选择一个项目再上传文件', 'warning');
                        return;
                      }
                      uploaderRef.current?.triggerUpload();
                    }}
                    disabled={loading}
                    className="hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="上传文件"
                    data-tour="upload-btn"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M17 8L12 3L7 8"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 3V15"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </>
              )}
            </>
          )}

          {/* 上传组件 - 仅在项目/文件夹模式下显示 */}
          {!isAtRoot && (
            <MxCadUploader
              ref={uploaderRef}
              nodeId={() => getCurrentParentId()}
              buttonText=""
              buttonClassName="hidden"
              onSuccess={handleRefresh}
              onExternalReferenceSuccess={handleRefresh}
              onError={(err: string) => {
                // 错误已通过 MxCadUploader 组件处理
              }}
            />
          )}
        </div>
      </div>

      {/* 项目标签页 - 仅在项目根目录模式下显示 */}
      {isAtRoot && (
        <ProjectFilterTabs
          isProjectTrashView={isProjectTrashView}
          onToggleProjectTrashView={handleToggleProjectTrashView}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          isProjectRootMode={isProjectRootMode}
          nodesCount={nodes.length}
          onClearTrash={handleClearTrash}
          onRefresh={handleRefresh}
          loading={loading}
        />
      )}

      <FileSystemToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSearchSubmit={handleSearchSubmit}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isMultiSelectMode={isMultiSelectMode}
        onMultiSelectModeChange={setIsMultiSelectMode}
        selectedNodes={selectedNodes}
        nodesCount={nodes.length}
        onSelectAll={handleSelectAll}
        loading={loading}
        isTrashView={isTrashView}
        onClearTrash={handleClearProjectTrash}
        isAtRoot={isAtRoot}
      />
    </div>
  );

  const renderEmpty = (isProjectsEmpty: boolean) => (
    <div className="flex flex-col items-center justify-center py-16">
      <EmptyFolderIcon
        size={80}
        className="mb-6 animate-float"
        style={{ color: 'var(--text-muted)', opacity: 0.5 }}
      />
      <h3
        className="text-xl font-bold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        {isProjectTrashView
          ? '回收站是空的'
          : isTrashView
            ? '回收站是空的'
            : isProjectsEmpty
              ? '暂无项目'
              : '这个文件夹是空的'}
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        {isProjectTrashView
          ? '删除的项目会出现在这里'
          : isTrashView
            ? '删除的文件和文件夹会出现在这里'
            : searchTerm
              ? '没有找到匹配的内容'
              : isProjectsEmpty
                ? '开始创建您的第一个项目'
                : '上传文件或创建文件夹来开始使用'}
      </p>
      {isProjectsEmpty &&
        canCreateProject &&
        !isProjectTrashView &&
        !isTrashView && (
          <Button
            onClick={openCreateProject}
            variant="outline"
            size="sm"
            className="hover:shadow-md transition-all"
          >
            <FolderPlus size={14} className="mr-2" />
            创建项目
          </Button>
        )}
    </div>
  );

  const renderContent = () => {
    if (displayNodes.length === 0) {
      return renderEmpty(isAtRoot);
    }

    return (
      <>
        <div
          data-view-mode={viewMode}
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2'
              : 'divide-y'
          }
          style={
            viewMode !== 'grid' ? { borderColor: 'var(--border-subtle)' } : {}
          }
        >
          {displayNodes.map((node) => {
            // 获取节点权限信息
            const cachedPermissions = nodePermissions.get(node.id);
            const defaultPermissions = {
              canEdit: false,
              canDelete: false,
              canManageMembers: false,
              canManageRoles: false,
            };

            const permissions = node.isRoot
              ? cachedPermissions || defaultPermissions
              : {
                  canEdit: true,
                  canDelete: true,
                  canManageMembers: false,
                  canManageRoles: false,
                };

            return (
              <FileItem
                key={node.id}
                node={node}
                isSelected={selectedNodes.has(node.id)}
                viewMode={viewMode}
                isMultiSelectMode={isMultiSelectMode}
                isTrash={isTrashView || isProjectTrashView}
                onSelect={handleNodeSelect}
                onEnter={handleFileOpen}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onPermanentlyDelete={handlePermanentlyDelete}
                onRename={handleOpenRename}
                onRefresh={handleRefresh}
                onRestore={
                  isTrashView || isProjectTrashView
                    ? handleRestoreNode
                    : undefined
                }
                // @ts-ignore - pre-existing component prop type
                onEdit={
                  node.isRoot && permissions.canEdit
                    ? () => openEditProject(node)
                    : undefined
                }
                // @ts-ignore - pre-existing component prop type
                onDeleteNode={
                  node.isRoot && permissions.canDelete
                    ? () => {
                        // 在回收站视图中，删除为彻底删除
                        // 在正常视图中，删除为移到回收站
                        if (isProjectTrashView) {
                          handlePermanentlyDeleteProject(node.id, node.name);
                        } else {
                          handleDeleteProject(node.id, node.name);
                        }
                      }
                    : undefined
                }
                // @ts-ignore - pre-existing component prop type
                onShowMembers={
                  node.isRoot && permissions.canManageMembers
                    ? () => handleShowMembers(node)
                    : undefined
                }
                // @ts-ignore - pre-existing component prop type
                onShowRoles={
                  node.isRoot && permissions.canManageRoles
                    ? () => handleShowRoles(node)
                    : undefined
                }
                onMove={
                  !node.isRoot &&
                  projectPermissions[ProjectPermission.FILE_MOVE]
                    ? handleMove
                    : undefined
                }
                onCopy={
                  !node.isRoot &&
                  projectPermissions[ProjectPermission.FILE_COPY]
                    ? handleCopy
                    : undefined
                }
                onShowVersionHistory={
                  !node.isFolder &&
                  !isTrashView &&
                  (node.extension === '.dwg' || node.extension === '.dxf')
                    ? handleShowVersionHistory
                    : undefined
                }
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                isDropTarget={dropTargetId === node.id}
                {...getFileItemPermissionProps(node, {
                  projectPermissions,
                  nodePermissions: permissions,
                })}
              />
            );
          })}
        </div>

        {/* 分页组件 - 始终显示，Pagination 组件会自行决定何时隐藏 */}
        <div
          className="px-6 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <Pagination
            meta={
              paginationMeta || { total: 0, page: 1, limit: 20, totalPages: 1 }
            }
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            showSizeChanger={true}
          />
        </div>
      </>
    );
  };

  return (
    <>
      {createPortal(
        <ToastContainer toasts={toasts} onRemove={removeToast} />,
        document.body
      )}

      {createPortal(
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText || '确定'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirm}
          type={confirmDialog.type}
        />,
        document.body
      )}

      <div className="max-w-7xl mx-auto space-y-6 relative">
        {renderHeader()}
      </div>

      <div
        className="max-w-7xl mx-auto mt-6 rounded-2xl relative min-h-[400px] shadow-sm overflow-visible"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="overflow-hidden h-full rounded-2xl">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div
                  className="w-16 h-16 rounded-full border-4"
                  style={{ borderColor: 'var(--border-default)' }}
                />
                <div
                  className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
                  style={{ borderColor: 'var(--primary-600)' }}
                />
              </div>
              <p
                className="mt-4 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                加载中...
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'var(--error-dim)' }}
              >
                <AlertCircle size={32} style={{ color: 'var(--error)' }} />
              </div>
              <p className="font-medium mb-4" style={{ color: 'var(--error)' }}>
                {error}
              </p>
              <Button onClick={handleRefresh} variant="outline">
                <RefreshIcon size={16} className="mr-2" />
                重试
              </Button>
            </div>
          )}

          {!loading && !error && renderContent()}
        </div>

        {isMultiSelectMode && selectedNodes.size > 0 && (
          <div
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-sm font-semibold">
              已选中 {selectedNodes.size} 项
            </span>
            <div
              className="w-px h-4"
              style={{ background: 'var(--border-default)' }}
            />

            {/* 回收站视图显示恢复按钮 */}
            {(isTrashView || isProjectTrashView) && (
              <button
                onClick={handleBatchRestore}
                className="text-emerald-400 hover:text-white text-sm font-medium transition-colors"
              >
                恢复
              </button>
            )}

            {/* 正常视图显示移动和复制按钮 */}
            {!isTrashView && !isProjectTrashView && (
              <>
                <button
                  onClick={() => {
                    setMoveSourceNode({ id: 'batch' });
                    setCopySourceNode(null);
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--primary-500)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  移动
                </button>
                <button
                  onClick={() => {
                    setMoveSourceNode(null);
                    setCopySourceNode({ id: 'batch' });
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--primary-500)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  复制
                </button>
              </>
            )}

            {(isTrashView || isProjectTrashView) && (
              <button
                onClick={() => handleBatchDelete(true)}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                彻底删除
              </button>
            )}

            {/* 正常视图的删除按钮 */}
            {!isTrashView && !isProjectTrashView && (
              <button
                onClick={() => handleBatchDelete(false)}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                删除
              </button>
            )}
            <button
              onClick={() => {
                selectedNodes.clear();
                setIsMultiSelectMode(false);
              }}
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 模态框组件 */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderNameChange={setFolderName}
        onCreate={handleCreateFolder}
      />

      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={loading}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        onNameChange={setFolderName}
        onRename={handleRename}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={editingProject}
        formData={projectFormData}
        loading={projectLoading}
        onClose={closeProjectModal}
        onFormDataChange={setProjectFormData}
        onSubmit={handleSubmitProject}
      />

      {/* 删除项目确认模态框 */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title="确认删除项目"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={cancelDelete}
              disabled={projectLoading}
            >
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={projectLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {projectLoading ? '删除中...' : '确认删除'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{
              background: 'var(--warning-dim)',
              border: '1px solid var(--warning)',
            }}
          >
            <AlertCircle
              size={20}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--warning)' }}
            />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-semibold mb-1">重要提示</p>
              <p style={{ color: 'var(--text-tertiary)' }}>
                删除项目后，项目中的所有文件和数据可能无法恢复。
              </p>
            </div>
          </div>
          {projectToDelete && (
            <div className="space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                删除项目：
              </p>
              <div
                className="p-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {projectToDelete.name}
                </p>
                {projectToDelete.description && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {projectToDelete.description}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            确定要删除该项目吗？此操作不可恢复。
          </p>
        </div>
      </Modal>

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsMembersModalOpen(false);
          setEditingProject(null);
        }}
      />

      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsProjectRolesModalOpen(false);
          setEditingProject(null);
        }}
      />

      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={
          moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
            ? ''
            : moveSourceNode?.id || copySourceNode?.id || ''
        }
        projectId={urlProjectId}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
        onConfirm={handleConfirmMoveOrCopy}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <KeyboardShortcuts
        onUploadExternalReference={handleUploadExternalReference}
        // @ts-ignore - pre-existing component prop type
        currentNode={currentNode}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        // @ts-ignore - pre-existing component prop type
        node={downloadingNode}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNode(null);
        }}
        onDownload={handleDownloadWithFormat}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        node={versionHistoryNode}
        entries={versionHistoryEntries}
        loading={versionHistoryLoading}
        error={versionHistoryError}
        onClose={() => {
          setShowVersionHistoryModal(false);
          setVersionHistoryNode(null);
          setVersionHistoryEntries([]);
          setVersionHistoryError(null);
        }}
        // @ts-ignore - pre-existing component prop type
        onOpenHistoricalVersion={handleOpenHistoricalVersion}
      />
    </>
  );
};

export default FileSystemManager;
