///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 统一的文件面板组件
 *
 * 支持四种模式：
 * - 项目模式 (默认): 显示项目列表和项目图纸
 * - 私人空间模式 (isPersonalSpace): 显示私人图纸
 * - 图纸库模式 (libraryType='drawing'): 显示公共图纸库
 * - 图块库模式 (libraryType='block'): 显示公共图块库
 *
 * 复用首页 FileItem 组件，保持"更多菜单"功能一致。
 */

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { MxFun } from 'mxdraw';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetChildren,
  fileSystemControllerGetNode,
  fileSystemControllerUpdateNode,
} from '@/api-sdk';
// @deprecated — legacy import for non-migrated write methods (createFolder, delete, rename, move, copy)
import { libraryApi } from '@/services/libraryApi'; // TODO: Replace with SDK when backend adds write endpoints
import { libraryControllerGetDrawingLibrary, libraryControllerGetDrawingChildren, libraryControllerGetDrawingAllFiles, libraryControllerGetBlockLibrary, libraryControllerGetBlockChildren, libraryControllerGetBlockAllFiles, libraryControllerGetBlockNode } from '@/api-sdk';
import { versionControlControllerGetFileHistory } from '@/api-sdk';
import { ResourceList, ResourceItem, ViewMode } from './common';
import { FileSystemNode, toFileSystemNode } from '@/types/filesystem';
import { FileItem } from './FileItem';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import { useAuth } from '@/contexts/AuthContext';
import { ProjectPermission, SystemPermission } from '@/constants/permissions';
import { usePermission } from '@/hooks/usePermission';
import { useFileSystemUI } from '@/hooks/file-system/useFileSystemUI';
import { useFileSystemCRUD } from '@/hooks/file-system/useFileSystemCRUD';
import { useFileSystemNavigation } from '@/hooks/file-system/useFileSystemNavigation';
import { useLibraryOperations } from '@/hooks/library/useLibraryOperations';
import { ToastContainer } from './ui/Toast';
import { Tooltip } from './ui/Tooltip';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DownloadFormatModal } from './modals/DownloadFormatModal';
import { RenameModal } from './modals/RenameModal';
import { MembersModal } from './modals/MembersModal';
import { ProjectRolesModal } from './modals/ProjectRolesModal';
import { ProjectModal } from './modals/ProjectModal';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { sanitizeFileName } from '@/utils/fileUtils';
import { handleError } from '@/utils/errorHandler';
import styles from './sidebar/sidebar.module.css';
import type { ProjectFilterType } from '@/services/projectApi';
import { CategoryTabs, CategoryLevel, CategoryItem } from './CategoryTabs';

/** API base URL for constructing thumbnail URLs (replaces filesApi.getThumbnailUrl) */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/** 库类型 */
export type LibraryType = 'drawing' | 'block';

interface ProjectDrawingsPanelProps {
  /** 项目 ID（编辑器当前打开的项目，用于"我的项目"Tab 的初始选择） */
  projectId?: string;
  /** 打开图纸回调 */
  onDrawingOpen: (node: FileSystemNode, libraryType?: LibraryType) => void;
  /** 是否为私人空间模式 */
  isPersonalSpace?: boolean;
  /** 当前打开的文件 ID */
  currentOpenFileId?: string | null;
  /** 当前文档是否已修改 */
  isModified?: boolean;
  /** 要显示的父目录 ID（如果提供，则直接显示该目录内容） */
  parentId?: string | null;
  /** 私人空间 ID（用于判断 parentId 是否属于私人空间） */
  personalSpaceId?: string | null;
  /** 库类型：图纸库或图块库（设置后进入图书馆模式） */
  libraryType?: LibraryType;
  /** 是否需要双击打开图纸（默认 false，单击打开） */
  doubleClickToOpen?: boolean;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

/** 每页显示数量 */
const PAGE_SIZE = 20;

/** 图纸文件扩展名 */
const DRAWING_EXTENSIONS = ['.dwg', '.dxf', '.dwt'];

/** 检查是否为图纸文件 */
function isDrawingFile(name: string): boolean {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = name.toLowerCase().slice(lastDot);
  return DRAWING_EXTENSIONS.includes(ext);
}

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  onDrawingOpen,
  isPersonalSpace = false,
  currentOpenFileId,
  isModified = false,
  parentId: initialParentId,
  personalSpaceId,
  libraryType,
  doubleClickToOpen = false,
}) => {
  const { user } = useAuth();
  const { hasPermission } = usePermission();

  // 是否为图书馆模式（图纸库/图块库）
  const isLibraryMode = libraryType === 'drawing' || libraryType === 'block';

  // 图书馆模式权限判断
  const canManageLibrary =
    isLibraryMode &&
    user !== null &&
    (libraryType === 'drawing'
      ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
      : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));

  // 重命名加载状态
  const [isRenameLoading, setIsRenameLoading] = useState(false);

  // 用于取消过期请求的请求 ID（使用 ref 保证同步更新）
  const activeRequestId = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [loading, setLoading] = useState(false);

  // 项目列表（用于项目选择器）
  const [projects, setProjects] = useState<FileSystemNode[]>([]);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);

  // 项目权限状态（用于项目列表中每个项目的权限）
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

  // 项目过滤类型：区分"我创建的"和"我加入的"项目
  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');

  // 当前选中的项目 ID（"我的项目"Tab 独立管理，不依赖外部 projectId）
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    isPersonalSpace ? projectId || null : null
  );

  // 图书馆根节点 ID（图书馆模式下使用）
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);

  // 图书馆分类状态（图书馆模式下使用）
  const [categories, setCategories] = useState<CategoryLevel[]>([]);
  
  // 分类加载完成状态（用于触发列表加载）
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  
  // 从 localStorage 读取保存的分类路径，若无则默认为 ['all']
  const getDefaultCategoryPath = (): string[] => {
    try {
      const saved = localStorage.getItem(`library_category_path_${libraryType}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
    }
    return ['all'];
  };
  
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string[]>(
    getDefaultCategoryPath
  );

  // 面包屑导航
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);

  // 滚动加载状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // 项目文件权限（使用统一的权限加载 Hook）
  const { permissions: projectPermissions } =
    useProjectPermissions(selectedProjectId);

  // 版本历史状态
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

  // 面包屑折叠状态
  const [isBreadcrumbExpanded, setIsBreadcrumbExpanded] = useState(false);
  const breadcrumbDropdownRef = useRef<HTMLDivElement>(null);
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);

  // 面包屑动态折叠状态
  const [visibleItemCount, setVisibleItemCount] = useState<number>(0);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  // ========== UI Hook（先初始化，其他 hooks 依赖） ==========
  const {
    toasts,
    confirmDialog,
    showToast,
    removeToast,
    showConfirm: showConfirmUI,
    closeConfirm,
  } = useFileSystemUI();

  // 适配层：将 useFileSystemUI 的 showConfirm 转换为 useLibraryOperations 期望的类型
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => Promise<void> | void,
      type?: 'danger' | 'warning' | 'info' | 'success',
      confirmText?: string
    ) => {
      showConfirmUI(
        title,
        message,
        () => {
          onConfirm();
        },
        type === 'success' ? 'warning' : type,
        confirmText
      );
    },
    [showConfirmUI]
  );

  // 回收站视图 ref（侧边栏不使用回收站视图）

  const isProjectTrashViewRef = useRef(false);

  // 加载项目列表（非私人空间模式、非图书馆模式下）
  useEffect(() => {
    if (isPersonalSpace || isLibraryMode) return;

    const loadProjects = async () => {
      try {
        const { data: response } = await fileSystemControllerGetProjects({ query: { filter: projectFilter } as any });
        const projectList = (response as any)?.nodes || [];
        setProjects(
          projectList.map(
            (p: any): FileSystemNode => ({
              id: p.id,
              name: p.name,
              isFolder: true,
              isRoot: true,
              updatedAt: p.updatedAt,
              parentId: undefined,
              createdAt: p.createdAt || '',
              path: '',
              ownerId: p.ownerId || '',
            })
          )
        );
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载项目列表失败');
      }
    };

    loadProjects();
  }, [isPersonalSpace, projectFilter, projectRefreshKey]);

  // 加载项目权限（项目列表中每个项目的权限，图书馆模式下跳过）
  useEffect(() => {
    if (isPersonalSpace || isLibraryMode || projects.length === 0) return;

    const loadProjectPermissions = async () => {
      const {
        canEditNode,
        canDeleteNode,
        canManageNodeMembers,
        canManageNodeRoles,
      } = await import('../utils/permissionUtils');

      // 并行加载所有项目的权限
      const permissionsPromises = projects.map(async (project) => {
        const [canEdit, canDelete, canManageMembers, canManageRoles] =
          await Promise.all([
            canEditNode(user, project.id),
            canDeleteNode(user, project.id),
            canManageNodeMembers(user, project.id),
            canManageNodeRoles(user, project.id),
          ]);

        return {
          projectId: project.id,
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
          newMap.set(result.projectId, {
            canEdit: result.canEdit,
            canDelete: result.canDelete,
            canManageMembers: result.canManageMembers,
            canManageRoles: result.canManageRoles,
          });
        });
        return newMap;
      });
    };

    loadProjectPermissions();
  }, [isPersonalSpace, projects, user]);

  // 加载当前目录下的节点（支持分页和搜索）
  const loadNodes = useCallback(
    async (
      nodeId: string,
      page: number = 1,
      search?: string,
      append: boolean | 'prepend' = false
    ) => {
      // 生成新的请求 ID，用于忽略过期的请求响应（使用 ref 保证同步更新）
      const currentRequestId = activeRequestId.current + 1;
      activeRequestId.current = currentRequestId;
      
      setLoading(true);
      try {
        // 根据模式选择不同的 API
        let nodeList: FileSystemNode[] = [];
        let total = 0;
        let totalPages = 1;

        if (isLibraryMode) {
          // 图书馆模式：使用 SDK，递归获取所有层级的文件
          const response =
            libraryType === 'drawing'
              ? await libraryControllerGetDrawingAllFiles({ path: { nodeId }, query: {
                  page,
                  limit: PAGE_SIZE,
                  search: search || undefined,
                } })
              : await libraryControllerGetBlockAllFiles({ path: { nodeId }, query: {
                  page,
                  limit: PAGE_SIZE,
                  search: search || undefined,
                } });
          nodeList = (response as any)?.nodes || [];
          total = (response as any)?.total || 0;
          totalPages =
            (response as any)?.totalPages || Math.ceil(total / PAGE_SIZE) || 1;
        } else {
          // 项目/私人空间模式：使用 SDK
          const { data: response } = await fileSystemControllerGetChildren({
            path: { nodeId },
            query: { page, limit: PAGE_SIZE, search: search || undefined } as any,
          });
          nodeList = (response?.nodes || []).map(toFileSystemNode);
          total = response?.total || 0;
          totalPages =
            response?.totalPages || Math.ceil(total / PAGE_SIZE) || 1;
        }

        // 检查请求是否已过期（如果期间有新的请求发出，则忽略此响应）
        if (currentRequestId !== activeRequestId.current) {
          return;
        }

        // 追加模式：保留已有数据
        if (append === 'prepend') {
          // 前置模式：追加到开头（向上滚动加载上一页）
          // 使用 Map 去重，保留新数据（前置的优先级更高）
          setNodes((prev) => {
            const uniqueMap = new Map<string, FileSystemNode>();
            nodeList.forEach((node) => uniqueMap.set(node.id, node));
            prev.forEach((node) => {
              if (!uniqueMap.has(node.id)) {
                uniqueMap.set(node.id, node);
              }
            });
            return Array.from(uniqueMap.values());
          });
        } else if (append === true) {
          // 追加模式：追加到末尾（向下滚动加载下一页）
          // 使用 Map 去重，保留已有数据（避免分页重复）
          setNodes((prev) => {
            const uniqueMap = new Map<string, FileSystemNode>();
            prev.forEach((node) => uniqueMap.set(node.id, node));
            nodeList.forEach((node) => {
              if (!uniqueMap.has(node.id)) {
                uniqueMap.set(node.id, node);
              }
            });
            return Array.from(uniqueMap.values());
          });
        } else {
          // 替换模式：重置列表（跳转页面）
          // 使用 Set 去重
          const uniqueMap = new Map<string, FileSystemNode>();
          nodeList.forEach((node) => uniqueMap.set(node.id, node));
          setNodes(Array.from(uniqueMap.values()));
        }

        // 更新分页信息
        setTotal(total);
        setTotalPages(totalPages);
        setHasMore(page < totalPages);
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载节点失败');
        // 只有在请求未过期时才清空数据
        if (currentRequestId === activeRequestId.current && !append) {
          setNodes([]);
          setTotal(0);
        }
        setTotalPages(1);
        setHasMore(false);
      } finally {
        // 只有在请求未过期时才更新 loading 状态
        if (currentRequestId === activeRequestId.current) {
          setLoading(false);
        }
      }
    },
    [isLibraryMode, libraryType]
  );

  // 构建面包屑路径（带最大深度限制防止无限循环）
  const buildBreadcrumbPath = useCallback(async (nodeId: string) => {
    try {
      const path: BreadcrumbItem[] = [];
      let currentId: string | null = nodeId;
      let depth = 0;
      const MAX_DEPTH = 20; // 最大深度限制

      while (currentId && depth < MAX_DEPTH) {
        try {
          const { data: node } = await fileSystemControllerGetNode({ path: { nodeId: currentId } }) as unknown as { data: { id: string; name: string; parentId?: string | null } | undefined };
          if (node) {
            path.unshift({ id: node.id, name: node.name });
            currentId = node.parentId || null;
            depth++;
          } else {
            break;
          }
        } catch (error: unknown) {
          handleError(error, `ProjectDrawingsPanel: 获取节点 ${currentId} 失败`);
          break;
        }
      }

      if (path.length === 0) {
        return [{ id: nodeId, name: '根目录' }];
      }

      return path;
    } catch (error: unknown) {
      handleError(error, 'ProjectDrawingsPanel: 构建面包屑路径失败');
      return [{ id: nodeId, name: '根目录' }];
    }
  }, []);

  // ========== 复用 hooks（在 loadNodes 定义之后） ==========

  // 当前目录节点（用于 hooks 依赖）
  const currentNode = useMemo(() => {
    if (breadcrumb.length === 0) return null;
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    const node = nodes.find((n) => n.id === lastBreadcrumb?.id);
    if (node) return node;
    // 构造当前目录节点
    return {
      id: lastBreadcrumb?.id || '',
      name: lastBreadcrumb?.name || '',
      isFolder: true,
      parentId:
        breadcrumb.length > 1
          ? breadcrumb[breadcrumb.length - 2]?.id
          : undefined,
    } as FileSystemNode;
  }, [breadcrumb, nodes]);

  // 刷新数据的函数（支持项目模式和图书馆模式）
  const refreshNodes = useCallback(() => {
    // 刷新项目列表计数
    setProjectRefreshKey((k) => k + 1);

    if (isLibraryMode) {
      // 图书馆模式：根据当前分类刷新
      const currentCategoryId = selectedCategoryPath[selectedCategoryPath.length - 1];
      if (currentCategoryId === 'all' && libraryRootId) {
        loadNodes(libraryRootId, 1, searchQuery, false);
      } else if (currentCategoryId) {
        loadNodes(currentCategoryId, currentPage, searchQuery, false);
      }
    } else {
      // 项目模式：根据面包屑刷新
      const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
      if (lastBreadcrumb) {
        loadNodes(lastBreadcrumb.id);
      }
    }
  }, [
    isLibraryMode,
    selectedCategoryPath,
    libraryRootId,
    searchQuery,
    currentPage,
    breadcrumb,
    loadNodes,
  ]);

  // 图书馆操作 Hooks（复用公开资源库的操作函数）
  const libraryOperations = useLibraryOperations({
    libraryType: libraryType || 'drawing',
    showToast,
    refreshNodes,
    showConfirm,
  });

  // 图书馆模式重命名状态
  const [libraryRenameModalOpen, setLibraryRenameModalOpen] = useState(false);
  const [libraryRenamingNode, setLibraryRenamingNode] = useState<FileSystemNode | null>(null);
  const [libraryRenameName, setLibraryRenameName] = useState('');

  // 图书馆模式：打开重命名弹框
  const handleLibraryOpenRename = useCallback((node: FileSystemNode) => {
    setLibraryRenamingNode(node);
    // 如果是文件，去除扩展名
    if (!node.isFolder && node.name) {
      const lastDotIndex = node.name.lastIndexOf('.');
      const nameWithoutExtension =
        lastDotIndex !== -1 ? node.name.substring(0, lastDotIndex) : node.name;
      setLibraryRenameName(nameWithoutExtension);
    } else {
      setLibraryRenameName(node.name);
    }
    setLibraryRenameModalOpen(true);
  }, []);

  // 图书馆模式：执行重命名
  const handleLibraryRenameSubmit = useCallback(async () => {
    if (!libraryRenamingNode || !libraryRenameName.trim()) return;
    try {
      await libraryOperations.handleRename(
        libraryRenamingNode.id,
        libraryRenameName.trim(),
        () => {
          setLibraryRenameModalOpen(false);
          setLibraryRenamingNode(null);
          setLibraryRenameName('');
        }
      );
    } catch (error) {
      // 错误已在 libraryOperations 中处理
    }
  }, [libraryRenamingNode, libraryRenameName, libraryOperations]);

  // CRUD Hook: 重命名、删除等操作
  const {
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    handleRename,
    handleDelete,
    handleOpenRename,
  } = useFileSystemCRUD({
    urlProjectId: selectedProjectId || undefined,
    currentNode,
    loadData: refreshNodes,
    showToast,
    showConfirm,
    selectedNodes: new Set<string>(), // 侧边栏不支持多选
    nodes,
    clearSelection: () => {}, // 侧边栏不需要清除选中
    isProjectTrashViewRef,
    mode: isPersonalSpace ? 'personal-space' : 'project',
  });

  // Navigation Hook: 下载、打开文件等操作
  const {
    handleDownload,
    handleDownloadWithFormat,
    showDownloadFormatModal,
    setShowDownloadFormatModal,
    downloadingNode,
    setDownloadingNode,
  } = useFileSystemNavigation({
    urlProjectId: selectedProjectId || undefined,
    currentNode,
    showToast,
    mode: isPersonalSpace ? 'personal-space' : 'project',
  });

  // 统一的重命名处理函数（支持项目模式和图书馆模式）
  const handleRenameSubmit = useCallback(async () => {
    if (!editingNode || !folderName.trim()) return;

    setIsRenameLoading(true);
    try {
      if (isLibraryMode) {
        // 图书馆模式 - 使用共享 hooks 的重命名函数
        await libraryOperations.handleRename(editingNode.id, folderName.trim(), () => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        });
      } else {
        // 项目模式（使用 CRUD Hook 的逻辑）
        await handleRename();
        // handleRename 已经调用了 refreshNodes 和清理状态
      }
    } catch (error: unknown) {
      handleError(error, 'ProjectDrawingsPanel: 重命名失败');
      showToast('重命名失败', 'error');
    } finally {
      setIsRenameLoading(false);
    }
  }, [
    editingNode,
    folderName,
    isLibraryMode,
    libraryOperations,
    handleRename,
    showToast,
  ]);

  // 图书馆模式带格式的下载处理
  const handleLibraryDownloadWithFormat = useCallback(
    async (
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      }
    ) => {
      if (!downloadingNode || downloadingNode.isFolder) return;
      await libraryOperations.handleDownloadWithFormat(
        downloadingNode.id,
        downloadingNode.name,
        format,
        pdfOptions
      );
      setShowDownloadFormatModal(false);
      setDownloadingNode(null);
    },
    [downloadingNode, libraryOperations]
  );

  // 成员管理和角色管理状态
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(
    null
  );

  // 项目管理 hook（用于编辑项目）
  const {
    isModalOpen: isProjectModalOpen,
    editingProject: projectBeingEdited,
    formData: projectFormData,
    loading: projectLoading,
    openEditModal: openEditProjectModal,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleUpdate: handleUpdateProjectSubmit,
  } = useProjectManagement({
    onProjectUpdated: refreshNodes,
    onProjectDeleted: refreshNodes,
    showToast,
  });

  // 项目表单数据变更处理
  const handleProjectFormDataChange = useCallback(
    (data: { name: string; description: string }) => {
      setProjectFormData(data);
    },
    [setProjectFormData]
  );

  // 项目表单提交处理
  const handleProjectSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleUpdateProjectSubmit(async (id, data) => {
        // TODO: Replace with SDK when backend adds updateProject endpoint
        await fileSystemControllerUpdateNode({ path: { nodeId: id }, body: { name: data.name ?? undefined, description: data.description } as any });
      });
    },
    [handleUpdateProjectSubmit]
  );

  // 初始化：加载项目根目录
  useEffect(() => {
    if (!selectedProjectId) {
      setNodes([]);
      setBreadcrumb([]);
      return;
    }

    // 加载项目根节点信息用于面包屑
    const initProject = async () => {
      try {
        const { data: projectNode } = await fileSystemControllerGetNode({ path: { nodeId: selectedProjectId } });
        if (projectNode) {
          setBreadcrumb([{ id: projectNode.id, name: projectNode.name }]);
        }
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载项目信息失败');
      }
    };

    initProject();
    loadNodes(selectedProjectId);
  }, [selectedProjectId, loadNodes]);

  // 私人空间模式下，当外部 projectId 变化时同步
  useEffect(() => {
    if (isPersonalSpace && projectId && projectId !== selectedProjectId) {
      setSelectedProjectId(projectId);
    }
  }, [isPersonalSpace, projectId, selectedProjectId]);

  // 图书馆模式：获取库根节点并递归加载所有层级分类（先完整加载所有分类，再加载列表）
  useEffect(() => {
    if (!isLibraryMode) return;

    // 重置状态
    setCategories([]);
    setCategoriesLoaded(false);
    setNodes([]);
    setLoading(true);

    // 递归加载所有层级分类，返回完整的分类树
    const loadAllCategories = async (parentId: string, level: number): Promise<CategoryLevel | null> => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } })
            : await libraryControllerGetBlockChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } });

        const folders = (response as any)?.nodes || [];

        // 构建当前层级的分类项（添加"全部"选项）
        const items: CategoryItem[] = [
          { id: 'all', name: '全部', hasChildren: level === 0 },
          ...folders.map((folder: FileSystemNode) => ({
            id: folder.id,
            name: folder.name,
            hasChildren: true,
          })),
        ];

        const currentLevel: CategoryLevel = { level, items };

        // 如果不是最后一级，递归加载下一级分类（最多三级）
        if (level < 2 && folders.length > 0) {
          // 并行加载所有子分类
          const childPromises = folders.map((folder: any) => 
            loadAllCategories(folder.id, level + 1)
          );
          const childLevels = (await Promise.all(childPromises)).filter(Boolean) as CategoryLevel[];
          
          // 将子分类按层级合并
          childLevels.forEach(childLevel => {
            // 这里不需要处理子分类，因为我们只关注当前层级的分类项
            // 子分类会在用户选择时按需加载
          });
        }

        return currentLevel;
      } catch (error: unknown) {
        handleError(error, `ProjectDrawingsPanel: 加载第 ${level} 级分类失败`);
        return null;
      }
    };

    // 加载所有层级分类的主函数
    const loadAllLevels = async (rootId: string): Promise<CategoryLevel[]> => {
      const levels: CategoryLevel[] = [];

      // 加载一级分类
      const level0 = await loadAllCategories(rootId, 0);
      if (level0) {
        levels[0] = level0;

        // 如果一级分类有子项（除了"全部"），加载二级分类
        const level1Folders = level0.items.filter(item => item.id !== 'all');
        if (level1Folders.length > 0) {
          // 并行加载所有一级分类下的二级分类
          const level1ItemsMap = new Map<string, CategoryItem[]>();
          level1ItemsMap.set('all', [{ id: 'all', name: '全部', hasChildren: true }]);

          const level1Promises = level1Folders.map(async (folder) => {
            const level1 = await loadAllCategories(folder.id, 1);
            if (level1) {
              level1ItemsMap.set(folder.id, level1.items);
            }
          });
          await Promise.all(level1Promises);

          // 合并所有二级分类到一个层级
          const allLevel1Items: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: true }];
          const seenIds = new Set(['all']);
          level1ItemsMap.forEach((items) => {
            items.forEach(item => {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                allLevel1Items.push(item);
              }
            });
          });

          levels[1] = { level: 1, items: allLevel1Items };

          // 如果二级分类有子项（除了"全部"），加载三级分类
          const level2Folders = allLevel1Items.filter(item => item.id !== 'all');
          if (level2Folders.length > 0) {
            // 并行加载所有二级分类下的三级分类
            const level2ItemsMap = new Map<string, CategoryItem[]>();
            level2ItemsMap.set('all', [{ id: 'all', name: '全部', hasChildren: false }]);

            const level2Promises = level2Folders.map(async (folder) => {
              const level2 = await loadAllCategories(folder.id, 2);
              if (level2) {
                level2ItemsMap.set(folder.id, level2.items);
              }
            });
            await Promise.all(level2Promises);

            // 合并所有三级分类到一个层级
            const allLevel2Items: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: false }];
            const seenLevel2Ids = new Set(['all']);
            level2ItemsMap.forEach((items) => {
              items.forEach(item => {
                if (!seenLevel2Ids.has(item.id)) {
                  seenLevel2Ids.add(item.id);
                  allLevel2Items.push(item);
                }
              });
            });

            levels[2] = { level: 2, items: allLevel2Items };
          }
        }
      }

      return levels;
    };

    const fetchLibraryRoot = async () => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingLibrary()
            : await libraryControllerGetBlockLibrary();
        const libraryNode = response as any as { id?: string; name?: string };
        if (libraryNode?.id) {
          setLibraryRootId(libraryNode.id);

          try {
            // 一次性加载所有层级分类
            const allLevels = await loadAllLevels(libraryNode.id);
            
            // 一次性更新所有分类状态，避免闪烁
            setCategories(allLevels);
            
            // 分类全部加载完成后设置标记
            setCategoriesLoaded(true);
          } catch (error: unknown) {
            handleError(error, 'ProjectDrawingsPanel: 加载分类失败');
            setCategoriesLoaded(true);
          }
        }
      } catch (error: unknown) {
        handleError(error, `ProjectDrawingsPanel: 获取${libraryType === 'drawing' ? '图纸' : '图块'}库根节点失败`);
        setCategoriesLoaded(true);
      }
    };

    fetchLibraryRoot();
  }, [libraryType]);

  // 用于跟踪是否已初始化加载过列表数据
  const listInitializedRef = useRef(false);

  // 验证保存的分类路径是否有效，无效则切换到"全部"
  // 所有分类加载完成后，根据持久化的分类路径加载列表数据
  useEffect(() => {
    // 必须满足：图书馆模式、分类已加载完成、有库根ID、列表未初始化
    if (!isLibraryMode || !categoriesLoaded || !libraryRootId || listInitializedRef.current) return;

    // 标记列表已初始化
    listInitializedRef.current = true;

    // 检查保存的分类路径是否有效
    const validateCategoryPath = (): boolean => {
      for (let level = 0; level < selectedCategoryPath.length; level++) {
        const categoryId = selectedCategoryPath[level];
        if (categoryId === 'all') continue;
        
        const categoryLevel = categories[level];
        if (!categoryLevel) return false;
        
        const exists = categoryLevel.items.some(item => item.id === categoryId);
        if (!exists) return false;
      }
      return true;
    };

    // 如果分类路径无效，切换到"全部"
    if (!validateCategoryPath()) {
      const defaultPath = ['all'];
      setSelectedCategoryPath(defaultPath);
      try {
        localStorage.setItem(`library_category_path_${libraryType}`, JSON.stringify(defaultPath));
      } catch {
      }
      return;
    }

    // 根据当前分类路径加载列表数据
    const loadListData = async () => {
      try {
        const currentCategoryId = selectedCategoryPath[selectedCategoryPath.length - 1];
        
        if (currentCategoryId === 'all') {
          // 选择"全部"时，使用递归接口获取所有文件
          const response =
            libraryType === 'drawing'
              ? await libraryControllerGetDrawingAllFiles({ path: { nodeId: libraryRootId }, query: {
                  page: 1,
                  limit: PAGE_SIZE,
                } })
              : await libraryControllerGetBlockAllFiles({ path: { nodeId: libraryRootId }, query: {
                  page: 1,
                  limit: PAGE_SIZE,
                } });

          const files = (response as any)?.nodes || [];
          const total = (response as any)?.total || 0;
          const totalPages =
            (response as any)?.totalPages || Math.ceil(total / PAGE_SIZE) || 1;

          setNodes(files);
          setTotal(total);
          setTotalPages(totalPages);
          setHasMore(1 < totalPages);
          setCurrentPage(1);
        } else {
          // 选择具体分类时，加载该分类下的文件
          if (currentCategoryId) {
            await loadNodes(currentCategoryId, 1, '', false);
          }
        }
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 加载列表数据失败');
        setNodes([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    // 执行加载
    loadListData();
  }, [isLibraryMode, categoriesLoaded, libraryRootId, libraryType]);

  // 当 libraryType 变化时重置所有列表相关状态
  useEffect(() => {
    listInitializedRef.current = false;
    setNodes([]);
    setBreadcrumb([]);
    setCurrentPage(1);
    setSearchQuery('');
    setHasMore(false);
    activeRequestId.current = 0;
  }, [libraryType]);

  /**
   * 加载分类数据
   * @param parentId 父节点 ID
   * @param level 分类级别
   */
  const loadCategories = useCallback(
    async (parentId: string, level: number) => {
      try {
        const response =
          libraryType === 'drawing'
            ? await libraryControllerGetDrawingChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } })
            : await libraryControllerGetBlockChildren({ path: { nodeId: parentId }, query: {
                nodeType: 'folder',
                limit: 100,
              } });

        const folders = (response as any)?.nodes || [];

        // 构建分类项（添加"全部"选项）
        const items: CategoryItem[] = [
          { id: 'all', name: '全部', hasChildren: level === 0 },
          ...folders.map((folder: FileSystemNode) => ({
            id: folder.id,
            name: folder.name,
            hasChildren: true,
          })),
        ];

        setCategories((prev) => {
          const newCategories = [...prev];
          // 替换或添加当前级别
          if (level < newCategories.length) {
            // 只有当新数据比旧数据更完整时才更新
            const existing = newCategories[level];
            if (!existing || existing.items.length <= 1 || items.length > existing.items.length) {
              newCategories[level] = { level, items };
            }
          } else {
            newCategories.push({ level, items });
          }
          // 一级和二级分类不清除更深层级，允许预加载的子分类保留
          // 具体分类的清除逻辑在 handleCategorySelect 中处理
          if (level <= 1) {
            return newCategories;
          }
          // 三级及以上分类清除更深层级
          return newCategories.slice(0, level + 1);
        });

        // 预加载下一级分类（当一级和二级分类加载完成后，预加载所有子分类）
        if (folders.length > 0 && level < 2) {
          folders.forEach((folder: FileSystemNode) => {
            loadCategories(folder.id, level + 1).catch(() => {
              // 忽略预加载错误
            });
          });
        }
      } catch (error: unknown) {
        handleError(error, `ProjectDrawingsPanel: 加载第 ${level} 级分类失败`);
      }
    },
    [libraryType]
  );

  // 使用 ref 存储函数，避免循环依赖
  const loadNodesRef = useRef(loadNodes);
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPath);
  const loadCategoriesRef = useRef<typeof loadCategories | null>(null);

  // 同步更新 ref
  useEffect(() => {
    loadNodesRef.current = loadNodes;
  }, [loadNodes]);

  useEffect(() => {
    buildBreadcrumbPathRef.current = buildBreadcrumbPath;
  }, [buildBreadcrumbPath]);

  useEffect(() => {
    loadCategoriesRef.current = loadCategories;
  }, [loadCategories]);

  /**
   * 处理分类选择
   * @param level 分类级别
   * @param categoryId 分类 ID
   */
  const handleCategorySelect = useCallback(
    async (level: number, categoryId: string) => {
      // 更新选中路径
      const newPath = selectedCategoryPath.slice(0, level);
      newPath.push(categoryId);
      
      // 保存到 localStorage
      try {
        localStorage.setItem(`library_category_path_${libraryType}`, JSON.stringify(newPath));
      } catch {
      }
      
      setSelectedCategoryPath(newPath);

      // 加载该分类下的文件和子分类
      if (categoryId === 'all') {
        // 选择"全部"时，使用递归接口获取所有文件
        if (libraryRootId) {
          setLoading(true);
          try {
            const response =
              libraryType === 'drawing'
                ? await libraryControllerGetDrawingAllFiles({ path: { nodeId: libraryRootId }, query: {
                    page: 1,
                    limit: PAGE_SIZE,
                  } })
                : await libraryControllerGetBlockAllFiles({ path: { nodeId: libraryRootId }, query: {
                    page: 1,
                    limit: PAGE_SIZE,
                  } });

            const files = (response as any)?.nodes || [];
            const total = (response as any)?.total || 0;
            const totalPages =
              (response as any)?.totalPages || Math.ceil(total / PAGE_SIZE) || 1;

            setNodes(files);
            setTotal(total);
            setTotalPages(totalPages);
            setHasMore(1 < totalPages);
            setCurrentPage(1);
          } catch (error: unknown) {
            handleError(error, 'ProjectDrawingsPanel: 获取所有文件失败');
            setNodes([]);
            setTotal(0);
          } finally {
            setLoading(false);
          }
        }
      } else {
        // 选择具体分类时，先加载数据再更新状态，避免抖动
        
        // 先加载子分类数据（不立即更新状态）
        let childCategories: CategoryItem[] = [{ id: 'all', name: '全部', hasChildren: level < 1 }];
        try {
          const response =
            libraryType === 'drawing'
              ? await libraryControllerGetDrawingChildren({ path: { nodeId: categoryId }, query: {
                  nodeType: 'folder',
                  limit: 100,
                } })
              : await libraryControllerGetBlockChildren({ path: { nodeId: categoryId }, query: {
                  nodeType: 'folder',
                  limit: 100,
                } });

          const folders = (response as any)?.nodes || [];
          childCategories = [
            { id: 'all', name: '全部', hasChildren: level < 1 },
            ...folders.map((folder: FileSystemNode) => ({
              id: folder.id,
              name: folder.name,
              hasChildren: true,
            })),
          ];
        } catch (error: unknown) {
          handleError(error, 'ProjectDrawingsPanel: 加载子分类失败');
        }

        // 一次性更新分类状态（直接替换对应层级，不清除更高级）
        setCategories(prev => {
          const newCategories = [...prev];
          // 更新当前层级选中状态（如果需要）
          // 设置下一层级的分类
          const nextLevel = level + 1;
          if (nextLevel < newCategories.length) {
            newCategories[nextLevel] = { level: nextLevel, items: childCategories };
          } else {
            newCategories.push({ level: nextLevel, items: childCategories });
          }
          // 清除更深层级（只保留到刚加载的层级）
          return newCategories.slice(0, nextLevel + 1);
        });
        
        // 加载该分类下的文件
        setLoading(true);
        setCurrentPage(1);
        try {
          loadNodesRef.current(categoryId, 1, '', false);
        } finally {
          setLoading(false);
        }
      }
    },
    [libraryRootId, libraryType, selectedCategoryPath]
  );

  // 当 external parentId 变化时，导航到对应目录
  useEffect(() => {
    const navigateToParentId = async () => {
      // 严格检查 parentId（排除 null, undefined, 空字符串）
      // 注意：图书馆模式和项目列表模式下，没有外部 parentId 是预期行为
      if (!initialParentId || initialParentId.trim() === '') {
        return;
      }

      // 私人空间模式（"我的图纸"）下，完全跳过外部 parentId 导航
      // "我的图纸"应该始终显示私人空间的图纸列表，不受当前打开文件的影响
      if (isPersonalSpace) {
        return;
      }

      // 非私人空间模式下，如果 parentId 属于私人空间，则忽略它
      // 因为"我的图纸"中的图纸在"我的项目"中不能访问，应该显示项目列表
      if (personalSpaceId) {
        try {
          // 构建 parentId 的路径，检查根节点是否为私人空间
          const path = await buildBreadcrumbPathRef.current(initialParentId);
          const rootId = path[0]?.id;

          if (rootId === personalSpaceId) {
            // 重置状态，显示项目列表
            setSelectedProjectId(null);
            setBreadcrumb([]);
            setNodes([]);
            return;
          }
        } catch (error: unknown) {
          handleError(error, 'ProjectDrawingsPanel: 检查 parentId 归属失败');
        }
      }

      try {
        // 构建面包屑路径
        const path = await buildBreadcrumbPathRef.current(initialParentId);

        if (path.length > 0) {
          // 设置面包屑和项目ID
          setBreadcrumb(path);
          const rootId = path[0]?.id || initialParentId;
          setSelectedProjectId(rootId);

          // 加载目标目录的节点
          await loadNodesRef.current(initialParentId);
        }
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 导航到 parentId 失败');
      }
    };

    navigateToParentId();
  }, [initialParentId, isPersonalSpace, personalSpaceId]);

  // 点击外部关闭面包屑下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 检查点击是否在下拉菜单按钮或其内部
      if (
        breadcrumbDropdownRef.current &&
        breadcrumbDropdownRef.current.contains(target)
      ) {
        return;
      }
      // 检查点击是否在下拉菜单内容区域（通过 data 属性判断）
      const isDropdownContent = (target as HTMLElement).closest?.(
        '[data-breadcrumb-dropdown]'
      );
      if (isDropdownContent) {
        return;
      }
      setIsBreadcrumbExpanded(false);
    };

    if (isBreadcrumbExpanded) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isBreadcrumbExpanded]);

  // 窗口滚动或调整大小时关闭下拉菜单（因为 Portal 渲染的位置是固定的）
  useEffect(() => {
    if (!isBreadcrumbExpanded) return;

    const handleScrollOrResize = () => {
      setIsBreadcrumbExpanded(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isBreadcrumbExpanded]);

  // 使用 ResizeObserver 监听面包屑容器宽度，动态计算是否需要折叠
  useEffect(() => {
    const container = breadcrumbContainerRef.current;
    if (!container) return;

    const calculateVisibleItems = () => {
      const containerWidth = container.clientWidth;
      // 预留空间：返回按钮 (80px) + 项目列表按钮 (80px) + 折叠指示器 (40px) + 边距 (20px)
      const reservedWidth = isPersonalSpace ? 140 : 220;
      const availableWidth = containerWidth - reservedWidth;

      // 获取所有面包屑项的宽度
      const items = container.querySelectorAll('[data-breadcrumb-item]');
      let totalWidth = 0;
      let count = 0;

      items.forEach((item, index) => {
        const width = (item as HTMLElement).offsetWidth;
        // 加上分隔符宽度 (约 16px)
        const itemTotalWidth = width + (index > 0 ? 16 : 0);

        if (totalWidth + itemTotalWidth <= availableWidth) {
          totalWidth += itemTotalWidth;
          count++;
        }
      });

      // 确保至少显示最后一项
      const minVisible = Math.min(1, breadcrumb.length);
      const finalCount = Math.max(minVisible, count);

      setVisibleItemCount(finalCount);
      setNeedsCollapse(finalCount < breadcrumb.length);
    };

    // 初始计算
    calculateVisibleItems();

    // 使用 ResizeObserver 监听容器宽度变化
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleItems();
    });

    resizeObserver.observe(container);

    // 也监听窗口大小变化
    window.addEventListener('resize', calculateVisibleItems);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', calculateVisibleItems);
    };
  }, [breadcrumb, isPersonalSpace]);

  // 点击进入文件夹
  const handleEnterFolder = useCallback(
    (folder: FileSystemNode) => {
      setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
      loadNodes(folder.id);
      setSearchQuery('');
      setCurrentPage(1);
    },
    [loadNodes]
  );

  // 点击面包屑返回
  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      const newBreadcrumb = breadcrumb.slice(0, index + 1);
      setBreadcrumb(newBreadcrumb);
      const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
      if (lastItem) {
        loadNodes(lastItem.id);
      }
      setSearchQuery('');
      setCurrentPage(1);
    },
    [breadcrumb, loadNodes]
  );

  // 返回上一级
  const handleGoBack = useCallback(() => {
    if (breadcrumb.length > 1) {
      // 返回面包屑的上一级
      const newBreadcrumb = breadcrumb.slice(0, -1);
      setBreadcrumb(newBreadcrumb);
      const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
      if (lastItem) {
        loadNodes(lastItem.id);
      }
    } else if (breadcrumb.length === 1 && !isPersonalSpace) {
      // 返回项目列表
      setSelectedProjectId(null);
      setBreadcrumb([]);
      setNodes([]);
    }
    setSearchQuery('');
    setCurrentPage(1);
  }, [breadcrumb, isPersonalSpace, loadNodes]);

  // 根据当前模式生成唯一的 key 前缀，避免不同模块间的 key 冲突
  const keyPrefix = useMemo(() => {
    if (isLibraryMode) {
      return libraryType === 'drawing' ? 'drawing-library' : 'block-library';
    }
    if (isPersonalSpace) {
      return 'personal-space';
    }
    return 'project-space';
  }, [isLibraryMode, libraryType, isPersonalSpace]);

  // 转换为 ResourceItem 格式
  const resourceItems: ResourceItem[] = useMemo(() => {

    // 图书馆模式：只显示文件，不显示文件夹
    if (isLibraryMode) {
      const files = nodes.filter((node) => !node.isFolder);

      const rootId = libraryRootId ?? undefined;

      const getThumbnailUrl = (nodeId: string): string | undefined => {
        return libraryType === 'drawing'
          ? libraryApi.getDrawingThumbnailUrl(nodeId)
          : libraryApi.getBlockThumbnailUrl(nodeId);
      };

      const fileItems: ResourceItem[] = files.map((node) => ({
        id: node.id,
        name: node.name,
        type: 'file',
        thumbnailUrl: getThumbnailUrl(node.id),
        updatedAt: node.updatedAt,
        size: node.size,
        isActive: node.id === currentOpenFileId,
        badge:
          node.id === currentOpenFileId && isModified ? (
            <span className={styles.modifiedIndicator} title="已修改">
              ●
            </span>
          ) : undefined,
        filePath: undefined,
        parentId: node.parentId,
        projectId: rootId,
        isCadFile: true,
        keyPrefix,
      }));

      // 过滤搜索
      const query = searchQuery.toLowerCase();
      return searchQuery
        ? fileItems.filter((item) => item.name.toLowerCase().includes(query))
        : fileItems;
    }

    // 项目/私人空间模式：显示文件夹和图纸文件
    const folders = nodes.filter((node) => node.isFolder);
    const files = nodes.filter(
      (node) => !node.isFolder && isDrawingFile(node.name)
    );

    const folderItems: ResourceItem[] = folders.map((node) => ({
      id: node.id,
      name: node.name,
      type: 'folder',
      updatedAt: node.updatedAt,
      keyPrefix,
    }));

    // 从面包屑获取根节点 ID（项目或私人空间），确保版本历史功能正常
    const rootId = isLibraryMode
      ? (libraryRootId ?? undefined)
      : (selectedProjectId ?? breadcrumb[0]?.id ?? undefined);

    // 根据模式获取缩略图 URL
    const getThumbnailUrl = (nodeId: string): string | undefined => {
      if (isLibraryMode) {
        return libraryType === 'drawing'
          ? libraryApi.getDrawingThumbnailUrl(nodeId)
          : libraryApi.getBlockThumbnailUrl(nodeId);
      }
      return `${API_BASE}/v1/file-system/nodes/${nodeId}/thumbnail`;
    };

    const fileItems: ResourceItem[] = files.map((node) => ({
      id: node.id,
      name: node.name,
      type: 'file',
      thumbnailUrl: getThumbnailUrl(node.id),
      updatedAt: node.updatedAt,
      size: node.size,
      isActive: node.id === currentOpenFileId,
      badge:
        node.id === currentOpenFileId && isModified ? (
          <span className={styles.modifiedIndicator} title="已修改">
            ●
          </span>
        ) : undefined,
      // 版本历史相关属性（图书馆模式不支持）
      filePath: isLibraryMode ? undefined : node.path,
      parentId: node.parentId,
      projectId: rootId,
      isCadFile: true,
      keyPrefix,
    }));

    // 过滤搜索（前端搜索，仅针对当前页数据）
    const query = searchQuery.toLowerCase();
    const filteredFolders = searchQuery
      ? folderItems.filter((item) => item.name.toLowerCase().includes(query))
      : folderItems;
    const filteredFiles = searchQuery
      ? fileItems.filter((item) => item.name.toLowerCase().includes(query))
      : fileItems;

    return [...filteredFolders, ...filteredFiles];
  }, [
    nodes,
    currentOpenFileId,
    isModified,
    searchQuery,
    selectedProjectId,
    breadcrumb,
    isLibraryMode,
    libraryType,
    libraryRootId,
    keyPrefix,
  ]);

  // 点击图纸
  const handleItemClick = useCallback(
    (item: ResourceItem) => {
      const node = nodes.find((n) => n.id === item.id);
      if (!node) return;

      if (node.isFolder) {
        handleEnterFolder(node);
      } else {
        // 图书馆模式
        if (isLibraryMode) {
          // user 为 null 表示未登录，检查是否有库管理权限
          const isLoggedIn = user !== null;

          // 检查用户是否有库管理权限（需要先登录）
          const hasSystemPermission =
            isLoggedIn &&
            (libraryType === 'drawing'
              ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
              : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));

          // 有系统权限的用户：和"我的图纸"一样打开
          if (hasSystemPermission) {
            onDrawingOpen(node, libraryType);
          } else {
            // 无权限用户或未登录：使用公开 URL 方式打开
            if (libraryType === 'drawing') {
              import('../services/mxcadManager').then(
                ({ openLibraryDrawing }) => {
                  openLibraryDrawing(
                    node.id,
                    node.name,
                    node.path || '',
                    node.updatedAt
                  ).catch((error: unknown) => {
                    handleError(error, 'ProjectDrawingsPanel: 打开图纸库文件失败');
                  });
                }
              );
            } else {
              // 图块库：插入图块到当前打开的图纸
              const mxwebUrl = `/api/v1/library/block/filesData/${node.path}`;
              const cmdParam = {
                filePath: mxwebUrl,
                name: node.name,
                isBlockLibrary: true,
              };
              MxFun.sendStringToExecute('Mx_Insert', cmdParam);
            }
          }
        } else {
          // 项目模式：使用原有逻辑
          onDrawingOpen(node);
        }
      }
    },
    [
      nodes,
      handleEnterFolder,
      onDrawingOpen,
      isLibraryMode,
      libraryType,
      hasPermission,
      user,
    ]
  );

  // 下一次加载的方向
  const [nextLoadDirection, setNextLoadDirection] = useState<'up' | 'down' | 'jump' | null>(null);

  // 滚动加载更多
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;

    let nodeId: string | undefined;

    if (isLibraryMode) {
      // 图书馆模式：使用分类路径获取节点ID
      const currentCategoryId =
        selectedCategoryPath[selectedCategoryPath.length - 1];
      nodeId =
        currentCategoryId === 'all'
          ? (libraryRootId ?? undefined)
          : currentCategoryId;
    } else {
      // 项目模式：使用面包屑
      const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
      nodeId = lastBreadcrumb?.id;
    }

    if (nodeId) {
      const newPage = currentPage + 1;
      setNextLoadDirection('down'); // 设置方向
      setCurrentPage(newPage);
      loadNodes(nodeId, newPage, searchQuery, true);
    }
  }, [
    isLibraryMode,
    selectedCategoryPath,
    libraryRootId,
    breadcrumb,
    currentPage,
    hasMore,
    loading,
    loadNodes,
    searchQuery,
  ]);

  // 分页模式下的页码变化回调
  // direction: 'prev' 向上滚动加载上一页，'next' 向下滚动加载下一页，'jump' 跳转页面（重置列表）
  const handlePageChange = useCallback(
    (page: number, direction: 'prev' | 'next' | 'jump') => {
      let nodeId: string | undefined;

      if (isLibraryMode) {
        const currentCategoryId =
          selectedCategoryPath[selectedCategoryPath.length - 1];
        nodeId =
          currentCategoryId === 'all'
            ? (libraryRootId ?? undefined)
            : currentCategoryId;
      } else {
        const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
        nodeId = lastBreadcrumb?.id;
      }

      if (!nodeId) return;

      // 设置加载前先保存方向
      const loadDir = direction === 'prev' ? 'up' : direction === 'jump' ? 'jump' : 'down';
      setNextLoadDirection(loadDir);
      
      setCurrentPage(page);

      // 跳转页面时重置列表（清空现有数据，加载对应页）
      if (direction === 'jump') {
        setNodes([]);
        setHasMore(page < totalPages);
        loadNodes(nodeId, page, searchQuery, false);
      } else if (direction === 'next') {
        // 向下滚动加载下一页：追加到末尾
        loadNodes(nodeId, page, searchQuery, true);
      } else {
        // 向上滚动加载上一页：前置到开头
        loadNodes(nodeId, page, searchQuery, 'prepend');
      }
    },
    [
      isLibraryMode,
      selectedCategoryPath,
      libraryRootId,
      breadcrumb,
      totalPages,
      searchQuery,
      loadNodes,
    ]
  );

  // 点击进入项目
  const handleEnterProject = useCallback((project: FileSystemNode) => {
    setSelectedProjectId(project.id);
    setBreadcrumb([{ id: project.id, name: project.name }]);
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  // 返回项目列表
  const handleBackToProjects = useCallback(() => {
    setSelectedProjectId(null);
    setBreadcrumb([]);
    setNodes([]);
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  // ========== 版本历史相关 ==========

  // 显示成员管理
  const handleShowMembers = useCallback((node: FileSystemNode) => {
    setEditingProject(node);
    setIsMembersModalOpen(true);
  }, []);

  // 显示角色管理
  const handleShowRoles = useCallback((node: FileSystemNode) => {
    setEditingProject(node);
    setIsProjectRolesModalOpen(true);
  }, []);

  // 编辑项目
  const handleEditProject = useCallback(
    (node: FileSystemNode) => {
      openEditProjectModal(node);
    },
    [openEditProjectModal]
  );

  // 提交项目表单
  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleUpdateProjectSubmit(async (id, data) => {
        // TODO: Replace with SDK when backend adds updateProject endpoint
        await fileSystemControllerUpdateNode({ path: { nodeId: id }, body: { name: data.name ?? undefined, description: data.description } as any });
      });
    },
    [handleUpdateProjectSubmit]
  );

  // 显示版本历史
  const handleShowVersionHistory = useCallback(
    async (node: FileSystemNode) => {
      if (!node.path || !selectedProjectId) return;

      setVersionHistoryNode(node);
      setShowVersionHistoryModal(true);
      setVersionHistoryLoading(true);
      setVersionHistoryError(null);

      try {
        const { data: response } = await versionControlControllerGetFileHistory({
          query: { projectId: selectedProjectId, filePath: node.path, limit: 50 },
        });
        if (response?.success) {
          setVersionHistoryEntries(response.entries || []);
        } else {
          setVersionHistoryError(response?.message || '加载版本历史失败');
        }
      } catch (error: unknown) {
        handleError(error, 'ProjectDrawingsPanel: 版本历史加载失败');
        setVersionHistoryError(
          error instanceof Error ? error.message : '加载版本历史失败'
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [selectedProjectId]
  );

  // 打开历史版本
  const handleOpenHistoricalVersion = useCallback(
    (revision: number) => {
      if (!versionHistoryNode?.path || !versionHistoryNode.id) return;
      const url = `/cad-editor/${versionHistoryNode.id}?nodeId=${versionHistoryNode.parentId}&v=${revision}`;
      window.open(url, '_blank');
    },
    [versionHistoryNode]
  );

  // 自定义渲染项（使用 FileItem 组件）
  const renderFileItem = useCallback(
    (item: ResourceItem, viewMode: ViewMode) => {
      // 找到对应的 FileSystemNode
      const node = nodes.find((n) => n.id === item.id);
      if (!node) {
        return null;
      }

      // 图书馆模式的下载处理
      const handleLibraryDownload = () => {
        if (node.isFolder) return;
        setDownloadingNode(node);
        setShowDownloadFormatModal(true);
      };

      // 图书馆模式的删除处理
      const handleLibraryDelete = () => {
        libraryOperations.handleDelete(node);
      };

      // 图块库模式下的插入图块处理
      const handleBlockInsert = async (blockNode: FileSystemNode) => {
        if (blockNode.isFolder) {
          handleEnterFolder(blockNode);
          return;
        }

        try {
          // 动态导入 MxCpp 检查是否在编辑器中
          const { MxCpp } = await import('mxcad');
          const mxcad = MxCpp.getCurrentMxCAD();

          if (!mxcad) {
            showToast('请先打开一张图纸，然后再插入图块', 'warning');
            return;
          }

          // 获取最新的 updatedAt（确保使用最新时间戳，避免缓存问题）
          let latestUpdatedAt = blockNode.updatedAt;
          try {
            const response = await libraryControllerGetBlockNode({ path: { nodeId: blockNode.id } });
            if (response.data?.updatedAt) {
              latestUpdatedAt = response.data.updatedAt;
            }
          } catch {
          }

          // 使用统一的 filesData/*path 格式（与 node.path 保持一致）
          const filesPath = `/api/v1/library/block/filesData/${blockNode.path}`;

          // 添加时间戳参数，确保获取最新文件（避免缓存问题）
          const timestamp = latestUpdatedAt
            ? new Date(latestUpdatedAt).getTime()
            : Date.now();
          const filesPathWithTimestamp = `${filesPath}?t=${timestamp}`;

          // 构建命令参数
          const cmdParam = {
            filePath: filesPathWithTimestamp,
            name: blockNode.name,
            isBlockLibrary: true,
          };

          // 调用 Mx_Insert 命令插入图块
          MxFun.sendStringToExecute('Mx_Insert', cmdParam);

          showToast(`正在插入图块：${blockNode.name}`, 'success');
        } catch (error: unknown) {
          handleError(error, 'ProjectDrawingsPanel: 插入图块失败');
          showToast('插入图块失败，请确保已在 CAD 编辑器中打开图纸', 'error');
        }
      };

      // 处理条目进入（双击打开）
      const handleEnter = (n: FileSystemNode) => {
        if (n.isFolder) {
          handleEnterFolder(n);
        } else if (isLibraryMode && libraryType === 'block') {
          // 图块库模式: 插入图块到当前图纸
          handleBlockInsert(n);
        } else if (isLibraryMode && libraryType === 'drawing') {
          const isLoggedIn = user !== null;
          const hasSystemPermission =
            isLoggedIn &&
            hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE);

          if (hasSystemPermission) {
            onDrawingOpen(n, libraryType);
          } else {
            // 无权限：使用公开 URL 方式打开
            import('../services/mxcadManager').then(
              ({ openLibraryDrawing }) => {
                openLibraryDrawing(
                  n.id,
                  n.name,
                  n.path || '',
                  n.updatedAt
                ).catch((error: unknown) => {
                  handleError(error, 'ProjectDrawingsPanel: 打开图纸库文件失败');
                });
              }
            );
          }
        } else {
          onDrawingOpen(n);
        }
      };

      return (
        <FileItem
          node={node}
          isSelected={false}
          viewMode={viewMode}
          galleryMode={isLibraryMode}
          isMultiSelectMode={false}
          isTrash={false}
          doubleClickToOpen={doubleClickToOpen}
          {...(isLibraryMode
            ? {
                canDownload: canManageLibrary,
                canEdit: canManageLibrary,
                canDelete: canManageLibrary,
                canUpload: canManageLibrary,
                canViewVersionHistory: false,
              }
            : getFileItemPermissionProps(node, { projectPermissions }))}
          onSelect={() => {}}
          onEnter={handleEnter}
          onDownload={isLibraryMode ? handleLibraryDownload : handleDownload}
          onDelete={isLibraryMode ? handleLibraryDelete : handleDelete}
          onRename={isLibraryMode ? handleLibraryOpenRename : handleOpenRename}
          onShowVersionHistory={
            isLibraryMode ? undefined : handleShowVersionHistory
          }
        />
      );
    },
    [
      nodes,
      projectPermissions,
      handleEnterFolder,
      onDrawingOpen,
      handleDownload,
      handleDelete,
      handleOpenRename,
      handleLibraryOpenRename,
      handleShowVersionHistory,
      isLibraryMode,
      libraryType,
      libraryOperations,
      breadcrumb,
      currentPage,
      loadNodes,
    ]
  );

  // 计算折叠后的面包屑项（基于动态宽度计算）
  const collapsedBreadcrumb = useMemo(() => {
    const items = breadcrumb;
    const totalItems = items.length;

    // 如果不需要折叠或层级较少，显示所有项
    if (!needsCollapse || totalItems <= 1) {
      return { visible: items, collapsed: [], needsCollapse: false };
    }

    // 动态计算可见项数
    // 策略：始终显示第一项和最后一项，中间根据可用空间显示
    const visibleCount = Math.max(2, visibleItemCount);

    if (visibleCount >= totalItems) {
      return { visible: items, collapsed: [], needsCollapse: false };
    }

    // 折叠中间部分：显示第一项 + ... + 最后 (visibleCount - 1) 项
    const firstItem = items[0];
    const lastItems = items.slice(-(visibleCount - 1));
    const collapsedItems = items.slice(1, -(visibleCount - 1));

    return {
      visible: [firstItem, ...lastItems],
      collapsed: collapsedItems,
      needsCollapse: true,
    };
  }, [breadcrumb, needsCollapse, visibleItemCount]);

  // "我的项目"模式下未选择项目时：显示项目列表（使用 FileItem 组件）
  // 图书馆模式下跳过此逻辑
  if (!isPersonalSpace && !isLibraryMode && !selectedProjectId && !loading) {
    return (
      <>
        <div className={styles.projectDrawingsPanel}>
          {/* 项目列表标题 */}
          <div className={styles.sectionTitle}>
            <FolderOpen size={16} />
            <span>我的项目 ({projects.length})</span>
          </div>

          {/* 项目过滤 Tab - 仅在非私人空间模式下显示 */}
          {!isPersonalSpace && (
            <div className={styles.projectFilterTabs}>
              {[
                { key: 'all', label: '全部' },
                { key: 'owned', label: '我创建的' },
                { key: 'joined', label: '我加入的' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.projectFilterTab} ${projectFilter === tab.key ? styles.active : ''}`}
                  onClick={() => setProjectFilter(tab.key as ProjectFilterType)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* 项目列表 - 使用 FileItem 组件 */}
          <div className={styles.drawingList}>
            {projects.length === 0 ? (
              <div className={styles.emptyState}>
                <FolderOpen size={48} className={styles.emptyIcon} />
                <div className={styles.emptyText}>暂无项目，请先创建项目</div>
              </div>
            ) : (
              projects
                .filter((p) =>
                  searchQuery
                    ? p.name.toLowerCase().includes(searchQuery.toLowerCase())
                    : true
                )
                .map((project) => {
                  // 获取项目权限
                  const projectPerms = nodePermissions.get(project.id);
                  return (
                    <FileItem
                      key={`project-space-${project.id}`}
                      node={project}
                      isSelected={false}
                      viewMode="list"
                      isMultiSelectMode={false}
                      isTrash={false}
                      {...getFileItemPermissionProps(project, {
                        projectPermissions: {},
                        nodePermissions: projectPerms,
                        disableUpload: true,
                      })}
                      onSelect={() => {}}
                      onEnter={handleEnterProject}
                      onDownload={() => {}}
                      onDelete={() => {}}
                      onRename={() => {}}
                      onEdit={
                        projectPerms?.canEdit
                          ? () => openEditProjectModal(project)
                          : undefined
                      }
                      onShowMembers={
                        projectPerms?.canManageMembers
                          ? () => {
                              setEditingProject(project);
                              setIsMembersModalOpen(true);
                            }
                          : undefined
                      }
                      onShowRoles={
                        projectPerms?.canManageRoles
                          ? () => {
                              setEditingProject(project);
                              setIsProjectRolesModalOpen(true);
                            }
                          : undefined
                      }
                    />
                  );
                })
            )}
          </div>
        </div>

        {/* 成员管理模态框 */}
        <MembersModal
          isOpen={isMembersModalOpen}
          projectId={editingProject?.id || ''}
          onClose={() => {
            setIsMembersModalOpen(false);
            setEditingProject(null);
          }}
        />

        {/* 项目角色管理模态框 */}
        <ProjectRolesModal
          isOpen={isProjectRolesModalOpen}
          projectId={editingProject?.id || ''}
          onClose={() => {
            setIsProjectRolesModalOpen(false);
            setEditingProject(null);
          }}
        />

        {/* 项目编辑模态框 */}
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={closeProjectModal}
          editingProject={editingProject}
          formData={projectFormData}
          onFormDataChange={setProjectFormData}
          onSubmit={handleSubmitProject}
          loading={projectLoading}
        />

        {/* Toast 提示 */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  // 面包屑导航
  const breadcrumbElement = (
    <div ref={breadcrumbContainerRef} className={styles.breadcrumb}>
      {/* 图书馆模式：简洁的返回按钮 */}
      {isLibraryMode && breadcrumb.length > 1 && (
        <>
          <button
            className={styles.breadcrumbBack}
            onClick={handleGoBack}
            title="返回上一级"
          >
            ←
          </button>
        </>
      )}

      {/* 非图书馆模式：返回按钮 + 项目列表 */}
      {!isLibraryMode &&
        (breadcrumb.length > 1 ||
          (!isPersonalSpace && breadcrumb.length > 0)) && (
          <>
            <button
              className={styles.breadcrumbItem}
              onClick={handleGoBack}
              title="返回上一级"
            >
              <ArrowLeft size={14} />
              <span>返回</span>
            </button>
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          </>
        )}

      {!isLibraryMode && !isPersonalSpace && (
        <>
          <button
            className={`${styles.breadcrumbItem} ${breadcrumb.length === 0 ? styles.active : ''}`}
            onClick={handleBackToProjects}
            disabled={breadcrumb.length === 0}
          >
            项目列表
          </button>
          {breadcrumb.length > 0 && (
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          )}
        </>
      )}

      {/* 智能折叠面包屑 */}
      {collapsedBreadcrumb.needsCollapse ? (
        <>
          {/* 第一项 */}
          {collapsedBreadcrumb.visible[0] && (
            <>
              <button
                data-breadcrumb-item
                className={styles.breadcrumbItem}
                onClick={() => handleBreadcrumbClick(0)}
              >
                {collapsedBreadcrumb.visible[0].name}
              </button>
              {isLibraryMode ? (
                <span className={styles.breadcrumbSeparator}>/</span>
              ) : (
                <ChevronRight
                  size={14}
                  className={styles.breadcrumbSeparator}
                />
              )}
            </>
          )}

          {/* 折叠指示器 + 下拉菜单 */}
          <div
            ref={breadcrumbDropdownRef}
            className={styles.breadcrumbCollapseWrapper}
          >
            <button
              data-breadcrumb-collapse-btn
              className={`${styles.breadcrumbItem} ${styles.breadcrumbCollapse}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsBreadcrumbExpanded(!isBreadcrumbExpanded);
              }}
              aria-expanded={isBreadcrumbExpanded}
              aria-haspopup="menu"
            >
              ...
            </button>

            {/* 下拉菜单 - 使用 Portal 渲染到 body 避免被裁剪 */}
            {isBreadcrumbExpanded &&
              createPortal(
                <div
                  data-breadcrumb-dropdown
                  className={styles.breadcrumbDropdown}
                  role="menu"
                  style={{
                    position: 'absolute',
                    top:
                      (breadcrumbDropdownRef.current?.getBoundingClientRect()
                        .bottom ?? 0) + 4,
                    left:
                      breadcrumbDropdownRef.current?.getBoundingClientRect()
                        .left ?? 0,
                  }}
                >
                  {collapsedBreadcrumb.collapsed.map((item, idx) => {
                    const originalIndex = idx + 1; // 计算在原始数组中的索引
                    return (
                      <button
                        key={item.id}
                        className={styles.breadcrumbDropdownItem}
                        onClick={() => {
                          handleBreadcrumbClick(originalIndex);
                          setIsBreadcrumbExpanded(false);
                        }}
                        role="menuitem"
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>,
                document.body
              )}
          </div>
          {isLibraryMode ? (
            <span className={styles.breadcrumbSeparator}>/</span>
          ) : (
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          )}

          {/* 最后可见项 */}
          {collapsedBreadcrumb.visible
            .slice(1)
            .filter((item): item is BreadcrumbItem => !!item)
            .map((item, idx) => {
              const originalIndex =
                breadcrumb.length -
                collapsedBreadcrumb.visible.length +
                1 +
                idx;
              const isLast = idx === collapsedBreadcrumb.visible.length - 2;
              return (
                <React.Fragment key={item.id}>
                  <button
                    data-breadcrumb-item
                    className={`${styles.breadcrumbItem} ${isLast ? styles.active : ''}`}
                    onClick={() => handleBreadcrumbClick(originalIndex)}
                    disabled={isLast}
                  >
                    {item.name}
                  </button>
                  {!isLast &&
                    (isLibraryMode ? (
                      <span className={styles.breadcrumbSeparator}>/</span>
                    ) : (
                      <ChevronRight
                        size={14}
                        className={styles.breadcrumbSeparator}
                      />
                    ))}
                </React.Fragment>
              );
            })}
        </>
      ) : (
        /* 不需要折叠时，正常显示 */
        breadcrumb.map((item, index) => (
          <React.Fragment key={item.id}>
            {(isLibraryMode
              ? index > 0
              : (isPersonalSpace || index > 0) && index > 0) &&
              (isLibraryMode ? (
                <span className={styles.breadcrumbSeparator}>/</span>
              ) : (
                <ChevronRight
                  size={14}
                  className={styles.breadcrumbSeparator}
                />
              ))}
            <button
              data-breadcrumb-item
              className={`${styles.breadcrumbItem} ${index === breadcrumb.length - 1 ? styles.active : ''}`}
              onClick={() => handleBreadcrumbClick(index)}
              disabled={index === breadcrumb.length - 1}
            >
              {item.name}
            </button>
          </React.Fragment>
        ))
      )}
    </div>
  );

  return (
    <div className={styles.projectDrawingsPanel}>
      {/* Toast 和确认对话框 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText || '确定'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
        type={confirmDialog.type}
      />

      {/* 图书馆模式：显示分类标签 */}
      {isLibraryMode && (
        <CategoryTabs
          categories={categories}
          selectedPath={selectedCategoryPath}
          onSelect={handleCategorySelect}
        />
      )}

      <ResourceList
        items={resourceItems}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          setCurrentPage(1); // 搜索时重置到第一页
          // 图书馆模式下使用当前选中的分类路径
          if (isLibraryMode) {
            const currentCategoryId =
              selectedCategoryPath[selectedCategoryPath.length - 1];
            const nodeId =
              currentCategoryId === 'all' ? libraryRootId : currentCategoryId;
            if (nodeId) {
              loadNodes(nodeId, 1, query);
            }
          } else {
            const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
            if (lastBreadcrumb) {
              loadNodes(lastBreadcrumb.id, 1, query);
            }
          }
        }}
        onItemClick={handleItemClick}
        doubleClickToOpen={doubleClickToOpen}
        emptyText={searchQuery ? '未找到匹配的内容' : '当前目录为空'}
        defaultViewMode="grid"
        total={total}
        totalPages={totalPages}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        paginationEnabled={true}
        breadcrumb={
          !isLibraryMode && (breadcrumb.length > 0 || !isPersonalSpace)
            ? breadcrumbElement
            : undefined
        }
        renderItem={renderFileItem}
        toolbarExtra={
          <Tooltip content="刷新" position="bottom">
            <button
              onClick={refreshNodes}
              disabled={loading}
              className={styles.refreshButton}
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
            </button>
          </Tooltip>
        }
        loadDirection={nextLoadDirection}
        onLoadComplete={() => {
          // 加载完成后重置方向
          setNextLoadDirection(null);
        }}
      />

      {/* 重命名模态框（项目模式） */}
      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={isRenameLoading}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        onNameChange={setFolderName}
        onRename={handleRenameSubmit}
      />

      {/* 重命名模态框（图书馆模式） */}
      <RenameModal
        isOpen={libraryRenameModalOpen}
        editingNode={libraryRenamingNode}
        newName={libraryRenameName}
        loading={false}
        onClose={() => {
          setLibraryRenameModalOpen(false);
          setLibraryRenamingNode(null);
          setLibraryRenameName('');
        }}
        onNameChange={setLibraryRenameName}
        onRename={handleLibraryRenameSubmit}
      />

      {/* 版本历史模态框 */}
      {showVersionHistoryModal &&
        versionHistoryNode &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 10000, background: 'var(--bg-overlay)' }}
            onClick={() => setShowVersionHistoryModal(false)}
          >
            <div
              className="relative w-full max-w-lg rounded-xl shadow-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                maxHeight: '80vh',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-6 py-4 border-b"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <h3
                  className="text-lg font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  版本历史 - {versionHistoryNode.name}
                </h3>
              </div>
              <div
                className="p-6 overflow-y-auto"
                style={{ maxHeight: '60vh' }}
              >
                {versionHistoryLoading ? (
                  <div
                    className="text-center py-8"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    加载中...
                  </div>
                ) : versionHistoryError ? (
                  <div
                    className="text-center py-8"
                    style={{ color: 'var(--error)' }}
                  >
                    {versionHistoryError}
                  </div>
                ) : versionHistoryEntries.length === 0 ? (
                  <div
                    className="text-center py-8"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    暂无版本历史
                  </div>
                ) : (
                  <div className="space-y-3">
                    {versionHistoryEntries.map((entry) => (
                      <div
                        key={entry.revision}
                        className="p-3 rounded-lg cursor-pointer transition-colors hover:opacity-80"
                        style={{ background: 'var(--bg-tertiary)' }}
                        onClick={() =>
                          handleOpenHistoricalVersion(entry.revision)
                        }
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span
                            className="text-sm font-medium"
                            style={{ color: 'var(--primary-500)' }}
                          >
                            v{entry.revision}
                          </span>
                          <span
                            className="text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {entry.author}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {entry.date}
                          </span>
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {entry.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="px-6 py-4 border-t flex justify-end"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <button
                  onClick={() => setShowVersionHistoryModal(false)}
                  className="px-4 py-2 rounded-lg border transition-colors"
                  style={{
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 下载格式选择模态框 */}
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingNode?.name || ''}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNode(null);
        }}
        onDownload={
          isLibraryMode
            ? handleLibraryDownloadWithFormat
            : handleDownloadWithFormat
        }
      />

      {/* 成员管理模态框 */}
      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || ''}
        onClose={() => {
          setIsMembersModalOpen(false);
          setEditingProject(null);
        }}
      />

      {/* 项目角色管理模态框 */}
      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={editingProject?.id || ''}
        onClose={() => {
          setIsProjectRolesModalOpen(false);
          setEditingProject(null);
        }}
      />

      {/* 项目编辑模态框 */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={closeProjectModal}
        editingProject={editingProject}
        formData={projectFormData}
        onFormDataChange={setProjectFormData}
        onSubmit={handleSubmitProject}
        loading={projectLoading}
      />
    </div>
  );
};

export default ProjectDrawingsPanel;
