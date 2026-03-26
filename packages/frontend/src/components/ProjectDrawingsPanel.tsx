///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 项目图纸面板组件
 *
 * 显示当前项目的图纸文件列表，支持目录导航和搜索。
 * 用于侧边栏的图纸 Tab 内容。
 * 
 * 复用首页 FileItem 组件，保持"更多菜单"功能一致。
 * 
 * 复用 hooks：
 * - useFileSystemUI: Toast 和确认对话框
 * - useFileSystemCRUD: 重命名、删除等文件操作
 * - useFileSystemNavigation: 下载、打开文件等导航操作
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import { projectsApi } from '../services/projectsApi';
import { filesApi } from '../services/filesApi';
import { versionControlApi } from '../services/versionControlApi';
import { ResourceList, ResourceItem, ViewMode } from './common';
import { FileSystemNode, toFileSystemNode } from '../types/filesystem';
import { FileItem } from './FileItem';
import { useProjectPermissions } from '../hooks/useProjectPermissions';
import { getFileItemPermissionProps } from '../hooks/useFileItemProps';
import { useAuth } from '../contexts/AuthContext';
import { ProjectPermission } from '../constants/permissions';
import { useFileSystemUI } from '../hooks/file-system/useFileSystemUI';
import { useFileSystemCRUD } from '../hooks/file-system/useFileSystemCRUD';
import { useFileSystemNavigation } from '../hooks/file-system/useFileSystemNavigation';
import { ToastContainer } from './ui/Toast';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DownloadFormatModal } from './modals/DownloadFormatModal';
import { AddToGalleryModal } from './modals/AddToGalleryModal';
import { MembersModal } from './modals/MembersModal';
import { ProjectRolesModal } from './modals/ProjectRolesModal';
import { ProjectModal } from './modals/ProjectModal';
import { useProjectManagement } from '../hooks/useProjectManagement';
import styles from './sidebar/sidebar.module.css';
import type { ProjectFilterType } from '../services/projectsApi';

interface ProjectDrawingsPanelProps {
  /** 项目 ID（编辑器当前打开的项目，用于"我的项目"Tab 的初始选择） */
  projectId: string;
  /** 打开图纸回调 */
  onDrawingOpen: (node: FileSystemNode) => void;
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
}) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [loading, setLoading] = useState(false);

  // 项目列表（用于项目选择器）
  const [projects, setProjects] = useState<FileSystemNode[]>([]);

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
    isPersonalSpace ? projectId : null
  );

  // 面包屑导航
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // 项目文件权限（使用统一的权限加载 Hook）
  const { permissions: projectPermissions } = useProjectPermissions(selectedProjectId);

  // 版本历史状态
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistoryNode, setVersionHistoryNode] = useState<FileSystemNode | null>(null);
  const [versionHistoryEntries, setVersionHistoryEntries] = useState<
    { revision: number; author: string; date: string; message: string }[]
  >([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(null);

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
    showConfirm,
    closeConfirm,
  } = useFileSystemUI();

    // 回收站视图 ref（侧边栏不使用回收站视图）

    const isProjectTrashViewRef = useRef(false);

    // 加载项目列表（非私人空间模式下）
  useEffect(() => {
    if (isPersonalSpace) return;

    const loadProjects = async () => {
      try {
        const response = await projectsApi.list(projectFilter);
        const projectList = response.data?.projects || [];
        setProjects(projectList.map((p): FileSystemNode => ({
          id: p.id,
          name: p.name,
          isFolder: true,
          isRoot: true,
          updatedAt: p.updatedAt,
          parentId: undefined,
          createdAt: p.createdAt || '',
          path: '',
          ownerId: p.ownerId || '',
        })));
      } catch (error) {
        console.error('加载项目列表失败:', error);
      }
    };

    loadProjects();
  }, [isPersonalSpace, projectFilter]);

  // 加载项目权限（项目列表中每个项目的权限）
  useEffect(() => {
    if (isPersonalSpace || projects.length === 0) return;

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
  const loadNodes = useCallback(async (nodeId: string, page: number = 1, search?: string, append: boolean = false) => {
    setLoading(true);
    try {
      const response = await projectsApi.getChildren(nodeId, {
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      const nodeList = response.data?.nodes || [];
      const newNodes = nodeList.map(toFileSystemNode);
      
      // 追加模式：保留已有数据
      if (append) {
        setNodes(prev => [...prev, ...newNodes]);
      } else {
        setNodes(newNodes);
      }
      
      // 更新分页信息
      const total = response.data?.total || 0;
      const totalPages = response.data?.totalPages || Math.ceil(total / PAGE_SIZE) || 1;
      setTotalPages(totalPages);
      setHasMore(page < totalPages);
    } catch (error) {
      console.error('加载节点失败:', error);
      if (!append) {
        setNodes([]);
      }
      setTotalPages(1);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // 构建面包屑路径（带最大深度限制防止无限循环）
  const buildBreadcrumbPath = useCallback(async (nodeId: string) => {
    try {
      const path: BreadcrumbItem[] = [];
      let currentId: string | null = nodeId;
      let depth = 0;
      const MAX_DEPTH = 20; // 最大深度限制

      while (currentId && depth < MAX_DEPTH) {
        try {
          const response = await projectsApi.getNode(currentId);
          const node = response.data;
          if (node) {
            path.unshift({ id: node.id, name: node.name });
            currentId = node.parentId || null;
            depth++;
          } else {
            break;
          }
        } catch (err) {
          console.error(`获取节点 ${currentId} 失败:`, err);
          break;
        }
      }

      if (path.length === 0) {
        return [{ id: nodeId, name: '根目录' }];
      }

      return path;
    } catch (error) {
      console.error('构建面包屑路径失败:', error);
      return [{ id: nodeId, name: '根目录' }];
    }
  }, []);

  // ========== 复用 hooks（在 loadNodes 定义之后） ==========
  
  // 当前目录节点（用于 hooks 依赖）
  const currentNode = useMemo(() => {
    if (breadcrumb.length === 0) return null;
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    const node = nodes.find(n => n.id === lastBreadcrumb?.id);
    if (node) return node;
    // 构造当前目录节点
    return {
      id: lastBreadcrumb?.id || '',
      name: lastBreadcrumb?.name || '',
      isFolder: true,
      parentId: breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2]?.id : undefined,
    } as FileSystemNode;
  }, [breadcrumb, nodes]);

  // 刷新数据的函数
  const refreshNodes = useCallback(() => {
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    if (lastBreadcrumb) {
      loadNodes(lastBreadcrumb.id);
    }
  }, [breadcrumb, loadNodes]);

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

  // 添加到图库状态
  const [showAddToGalleryModal, setShowAddToGalleryModal] = useState(false);
  const [selectedNodeForGallery, setSelectedNodeForGallery] = useState<FileSystemNode | null>(null);

  // 成员管理和角色管理状态
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(null);

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
  const handleProjectFormDataChange = useCallback((data: { name: string; description: string }) => {
    setProjectFormData(data);
  }, [setProjectFormData]);

  // 项目表单提交处理
  const handleProjectSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleUpdateProjectSubmit(async (id, data) => {
      await projectsApi.update(id, {
        name: data.name ?? undefined,
        description: data.description,
      });
    });
  }, [handleUpdateProjectSubmit]);

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
        const response = await projectsApi.getNode(selectedProjectId);
        const projectNode = response.data;
        if (projectNode) {
          setBreadcrumb([{ id: projectNode.id, name: projectNode.name }]);
        }
      } catch (error) {
        console.error('加载项目信息失败:', error);
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

  // 使用 ref 存储函数，避免 useEffect 依赖问题
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPath);
  const loadNodesRef = useRef(loadNodes);

  // 同步更新 ref
  useEffect(() => {
    buildBreadcrumbPathRef.current = buildBreadcrumbPath;
  }, [buildBreadcrumbPath]);

  useEffect(() => {
    loadNodesRef.current = loadNodes;
  }, [loadNodes]);

  // 当 external parentId 变化时，导航到对应目录
  useEffect(() => {
    const navigateToParentId = async () => {
      // 严格检查 parentId（排除 null, undefined, 空字符串）
      if (!initialParentId || initialParentId.trim() === '') {
        console.log('[ProjectDrawingsPanel] 没有提供有效的 parentId，跳过导航');
        return;
      }

      // 私人空间模式（"我的图纸"）下，完全跳过外部 parentId 导航
      // "我的图纸"应该始终显示私人空间的图纸列表，不受当前打开文件的影响
      if (isPersonalSpace) {
        console.log('[ProjectDrawingsPanel] 私人空间模式下忽略外部 parentId 导航，保持显示私人空间图纸列表');
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
            console.log('[ProjectDrawingsPanel] parentId 属于私人空间，在"我的项目"中忽略导航，显示项目列表');
            // 重置状态，显示项目列表
            setSelectedProjectId(null);
            setBreadcrumb([]);
            setNodes([]);
            return;
          }
        } catch (error) {
          console.error('[ProjectDrawingsPanel] 检查 parentId 归属失败:', error);
        }
      }

      console.log('[ProjectDrawingsPanel] 开始导航到 parentId:', initialParentId);

      try {
        // 构建面包屑路径
        const path = await buildBreadcrumbPathRef.current(initialParentId);
        console.log('[ProjectDrawingsPanel] 构建的面包屑路径:', path);

        if (path.length > 0) {
          // 设置面包屑和项目ID
          setBreadcrumb(path);
          const rootId = path[0]?.id || initialParentId;
          console.log('[ProjectDrawingsPanel] 设置项目ID:', rootId);
          setSelectedProjectId(rootId);

          // 加载目标目录的节点
          console.log('[ProjectDrawingsPanel] 加载目录节点:', initialParentId);
          await loadNodesRef.current(initialParentId);
        }
      } catch (error) {
        console.error('[ProjectDrawingsPanel] 导航到 parentId 失败:', error);
      }
    };

    navigateToParentId();
  }, [initialParentId, isPersonalSpace, personalSpaceId]);

  // 点击外部关闭面包屑下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 检查点击是否在下拉菜单按钮或其内部
      if (breadcrumbDropdownRef.current && breadcrumbDropdownRef.current.contains(target)) {
        return;
      }
      // 检查点击是否在下拉菜单内容区域（通过 data 属性判断）
      const isDropdownContent = (target as HTMLElement).closest?.('[data-breadcrumb-dropdown]');
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
  const handleEnterFolder = useCallback((folder: FileSystemNode) => {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadNodes(folder.id);
    setSearchQuery('');
    setCurrentPage(1);
  }, [loadNodes]);

  // 点击面包屑返回
  const handleBreadcrumbClick = useCallback((index: number) => {
    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    setBreadcrumb(newBreadcrumb);
    const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
    if (lastItem) {
      loadNodes(lastItem.id);
    }
    setSearchQuery('');
    setCurrentPage(1);
  }, [breadcrumb, loadNodes]);

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

  // 转换为 ResourceItem 格式
  const resourceItems: ResourceItem[] = useMemo(() => {
    const folders = nodes.filter((node) => node.isFolder);
    const drawings = nodes.filter(
      (node) => !node.isFolder && isDrawingFile(node.name)
    );

    const folderItems: ResourceItem[] = folders.map((node) => ({
      id: node.id,
      name: node.name,
      type: 'folder',
      updatedAt: node.updatedAt,
    }));

    // 从面包屑获取根节点 ID（项目或私人空间），确保版本历史功能正常
    const rootId = selectedProjectId || breadcrumb[0]?.id || undefined;

    const drawingItems: ResourceItem[] = drawings.map((node) => ({
      id: node.id,
      name: node.name,
      type: 'file',
      thumbnailUrl: filesApi.getThumbnailUrl(node.id),
      updatedAt: node.updatedAt,
      size: node.size,
      isActive: node.id === currentOpenFileId,
      badge: node.id === currentOpenFileId && isModified ? (
        <span className={styles.modifiedIndicator} title="已修改">●</span>
      ) : undefined,
      // 版本历史相关属性
      filePath: node.path,
      parentId: node.parentId,
      projectId: rootId,
      isCadFile: true,
    }));

    // 过滤搜索（前端搜索，仅针对当前页数据）
    const query = searchQuery.toLowerCase();
    const filteredFolders = searchQuery
      ? folderItems.filter((item) => item.name.toLowerCase().includes(query))
      : folderItems;
    const filteredDrawings = searchQuery
      ? drawingItems.filter((item) => item.name.toLowerCase().includes(query))
      : drawingItems;

    return [...filteredFolders, ...filteredDrawings];
  }, [nodes, currentOpenFileId, isModified, searchQuery, selectedProjectId, breadcrumb]);

  // 点击图纸
  const handleItemClick = useCallback((item: ResourceItem) => {
    const node = nodes.find((n) => n.id === item.id);
    if (!node) return;

    if (node.isFolder) {
      handleEnterFolder(node);
    } else {
      onDrawingOpen(node);
    }
  }, [nodes, handleEnterFolder, onDrawingOpen]);

  // 分页操作按钮
  const handlePreviousPage = () => {
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    if (currentPage > 1 && lastBreadcrumb) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      loadNodes(lastBreadcrumb.id, newPage);
    }
  };

  const handleNextPage = () => {
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    if (currentPage < totalPages && lastBreadcrumb) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      loadNodes(lastBreadcrumb.id, newPage);
    }
  };

  // 滚动加载更多
  const handleLoadMore = useCallback(() => {
    const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
    if (lastBreadcrumb && hasMore && !loading) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      loadNodes(lastBreadcrumb.id, newPage, searchQuery, true);
    }
  }, [breadcrumb, currentPage, hasMore, loading, loadNodes, searchQuery]);

  // 分页显示：始终显示（只要有数据）
  const paginationActions = nodes.length > 0 && (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">
        共 {nodes.length} 条 · 第 {currentPage}/{totalPages} 页
      </span>
      <button
        onClick={handlePreviousPage}
        disabled={currentPage <= 1}
        className={`px-2 py-1 text-xs rounded border ${
          currentPage <= 1
            ? 'text-gray-400 border-gray-200 cursor-not-allowed'
            : 'text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        上一页
      </button>
      <button
        onClick={handleNextPage}
        disabled={currentPage >= totalPages}
        className={`px-2 py-1 text-xs rounded border ${
          currentPage >= totalPages
            ? 'text-gray-400 border-gray-200 cursor-not-allowed'
            : 'text-gray-700 border-gray-300 hover:bg-gray-100'
        }`}
      >
        下一页
      </button>
    </div>
  );

  // 点击进入项目
  const handleEnterProject = useCallback((project: FileSystemNode) => {
    console.log('[ProjectDrawingsPanel] handleEnterProject called with:', project);
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

  // 添加到图库
  const handleAddToGallery = useCallback((node: FileSystemNode) => {
    if (!projectPermissions[ProjectPermission.GALLERY_ADD]) {
      showToast('您没有权限添加到图库', 'warning');
      return;
    }
    setSelectedNodeForGallery(node);
    setShowAddToGalleryModal(true);
  }, [projectPermissions, showToast]);

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
  const handleEditProject = useCallback((node: FileSystemNode) => {
    openEditProjectModal(node);
  }, [openEditProjectModal]);

  // 提交项目表单
  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleUpdateProjectSubmit(async (id, data) => {
        await projectsApi.update(id, {
          name: data.name ?? undefined,
          description: data.description,
        });
      });
    },
    [handleUpdateProjectSubmit]
  );

  // 显示版本历史
  const handleShowVersionHistory = useCallback(async (node: FileSystemNode) => {
    if (!node.path || !selectedProjectId) return;

    setVersionHistoryNode(node);
    setShowVersionHistoryModal(true);
    setVersionHistoryLoading(true);
    setVersionHistoryError(null);

    try {
      const response = await versionControlApi.getFileHistory(
        selectedProjectId,
        node.path,
        50
      );
      if (response.data?.success) {
        setVersionHistoryEntries(response.data.entries || []);
      } else {
        setVersionHistoryError(response.data?.message || '加载版本历史失败');
      }
    } catch (err) {
      console.error('版本历史加载失败:', err);
      setVersionHistoryError(err instanceof Error ? err.message : '加载版本历史失败');
    } finally {
      setVersionHistoryLoading(false);
    }
  }, [selectedProjectId]);

  // 打开历史版本
  const handleOpenHistoricalVersion = useCallback((revision: number) => {
    if (!versionHistoryNode?.path || !versionHistoryNode.id) return;
    const url = `/cad-editor/${versionHistoryNode.id}?nodeId=${versionHistoryNode.parentId}&v=${revision}`;
    window.open(url, '_blank');
  }, [versionHistoryNode]);

  // 自定义渲染项（使用 FileItem 组件）
  const renderFileItem = useCallback((item: ResourceItem, viewMode: ViewMode) => {
    // 找到对应的 FileSystemNode
    const node = nodes.find((n) => n.id === item.id);
    if (!node) return null;

    return (
      <FileItem
        node={node}
        isSelected={false}
        viewMode={viewMode}
        isMultiSelectMode={false}
        isTrash={false}
        {...getFileItemPermissionProps(node, { projectPermissions })}
        onSelect={() => {}}
        onEnter={(n) => {
          if (n.isFolder) {
            handleEnterFolder(n);
          } else {
            onDrawingOpen(n);
          }
        }}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onRename={handleOpenRename}
        onAddToGallery={handleAddToGallery}
        onShowVersionHistory={handleShowVersionHistory}
      />
    );
  }, [
    nodes,
    projectPermissions,
    handleEnterFolder,
    onDrawingOpen,
    handleDownload,
    handleDelete,
    handleOpenRename,
    handleAddToGallery,
    handleShowVersionHistory,
  ]);

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
      needsCollapse: true
    };
  }, [breadcrumb, needsCollapse, visibleItemCount]);

  // "我的项目"模式下未选择项目时：显示项目列表（使用 FileItem 组件）
  if (!isPersonalSpace && !selectedProjectId && !loading) {
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
                      key={project.id}
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

  // 面包屑导航 - 添加返回上一级按钮
  const breadcrumbElement = (
    <div ref={breadcrumbContainerRef} className={styles.breadcrumb}>
      {/* 返回上一级按钮 */}
      {(breadcrumb.length > 1 || (!isPersonalSpace && breadcrumb.length > 0)) && (
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
      
      {!isPersonalSpace && (
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
              <ChevronRight size={14} className={styles.breadcrumbSeparator} />
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
            {isBreadcrumbExpanded && createPortal(
              <div 
                data-breadcrumb-dropdown
                className={styles.breadcrumbDropdown} 
                role="menu"
                style={{
                  position: 'absolute',
                  top: (breadcrumbDropdownRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: breadcrumbDropdownRef.current?.getBoundingClientRect().left ?? 0,
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
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          
          {/* 最后可见项 */}
          {collapsedBreadcrumb.visible.slice(1).filter((item): item is BreadcrumbItem => !!item).map((item, idx) => {
            const originalIndex = breadcrumb.length - collapsedBreadcrumb.visible.length + 1 + idx;
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
                {!isLast && (
                  <ChevronRight size={14} className={styles.breadcrumbSeparator} />
                )}
              </React.Fragment>
            );
          })}
        </>
      ) : (
        /* 不需要折叠时，正常显示 */
        breadcrumb.map((item, index) => (
          <React.Fragment key={item.id}>
            {(isPersonalSpace || index > 0) && index > 0 && (
              <ChevronRight size={14} className={styles.breadcrumbSeparator} />
            )}
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
      
      <ResourceList
        items={resourceItems}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          setCurrentPage(1); // 搜索时重置到第一页
          const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
          if (lastBreadcrumb) {
            loadNodes(lastBreadcrumb.id, 1, query);
          }
        }}
        onItemClick={handleItemClick}
        emptyText={searchQuery ? '未找到匹配的内容' : '当前目录为空'}
        defaultViewMode="list"
        actions={paginationActions}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        breadcrumb={(breadcrumb.length > 0 || !isPersonalSpace) ? breadcrumbElement : undefined}
        showVersionHistory={true}
        renderItem={renderFileItem}
      />

      {/* 重命名模态框 */}
      {showRenameModal && editingNode && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 10000, background: 'var(--bg-overlay)' }}
          onClick={() => setShowRenameModal(false)}
        >
          <div
            className="bg-[var(--bg-elevated)] rounded-xl shadow-lg max-w-sm w-full border border-[var(--border-default)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">重命名</h3>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setShowRenameModal(false);
              }}
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowRenameModal(false)}
                className="flex-1 px-4 py-2 border border-[var(--border-default)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRename}
                disabled={!folderName.trim()}
                className="flex-1 px-4 py-2 bg-[var(--primary-600)] text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 版本历史模态框 */}
      {showVersionHistoryModal && versionHistoryNode && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 10000, background: 'var(--bg-overlay)' }}
          onClick={() => setShowVersionHistoryModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl shadow-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>版本历史 - {versionHistoryNode.name}</h3>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {versionHistoryLoading ? (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>加载中...</div>
              ) : versionHistoryError ? (
                <div className="text-center py-8" style={{ color: 'var(--error)' }}>{versionHistoryError}</div>
              ) : versionHistoryEntries.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>暂无版本历史</div>
              ) : (
                <div className="space-y-3">
                  {versionHistoryEntries.map((entry) => (
                    <div
                      key={entry.revision}
                      className="p-3 rounded-lg cursor-pointer transition-colors hover:opacity-80"
                      style={{ background: 'var(--bg-tertiary)' }}
                      onClick={() => handleOpenHistoricalVersion(entry.revision)}
                    >
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-medium" style={{ color: 'var(--primary-500)' }}>v{entry.revision}</span>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.author}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{entry.date}</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--border-default)' }}>
              <button
                onClick={() => setShowVersionHistoryModal(false)}
                className="px-4 py-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
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
        onDownload={handleDownloadWithFormat}
      />

      {/* 添加到图库模态框 */}
      <AddToGalleryModal
        isOpen={showAddToGalleryModal}
        onClose={() => {
          setShowAddToGalleryModal(false);
          setSelectedNodeForGallery(null);
        }}
        onSuccess={refreshNodes}
        nodeId={selectedNodeForGallery?.id || ''}
        fileName={selectedNodeForGallery?.name || ''}
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