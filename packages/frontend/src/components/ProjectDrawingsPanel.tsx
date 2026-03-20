///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 项目图纸面板组件
 *
 * 显示当前项目的图纸文件列表，支持目录导航和搜索。
 * 用于侧边栏的图纸 Tab 内容。
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import { projectsApi } from '../services/projectsApi';
import { filesApi } from '../services/filesApi';
import { ResourceList, ResourceItem } from './common';
import { FileSystemNode, toFileSystemNode } from '../types/filesystem';
import styles from './sidebar/sidebar.module.css';

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

/** 项目项组件 */
const ProjectItem: React.FC<{
  project: FileSystemNode;
  onClick: () => void;
}> = ({ project, onClick }) => {
  return (
    <div
      className={styles.projectItem}
      onClick={onClick}
      title={project.name}
    >
      <div className={styles.projectIcon}>
        <FolderOpen size={28} color="#3b82f6" />
      </div>
      <div className={styles.projectInfo}>
        <div className={styles.projectName}>{project.name}</div>
        <div className={styles.projectMeta}>
          {project.updatedAt && new Date(project.updatedAt).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })}
        </div>
      </div>
      <ChevronRight size={16} color="#9ca3af" />
    </div>
  );
};

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  onDrawingOpen,
  isPersonalSpace = false,
  currentOpenFileId,
  isModified = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [loading, setLoading] = useState(false);

  // 项目列表（用于项目选择器）
  const [projects, setProjects] = useState<FileSystemNode[]>([]);

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

  // 加载项目列表（非私人空间模式下）
  useEffect(() => {
    if (isPersonalSpace) return;

    const loadProjects = async () => {
      try {
        const response = await projectsApi.list();
        const projectList = response.data?.projects || [];
        setProjects(projectList.map((p) => ({
          id: p.id,
          name: p.name,
          isFolder: true,
          isRoot: true,
          updatedAt: p.updatedAt,
          parentId: null,
          createdAt: '',
          path: '',
          ownerId: '',
        } as unknown as FileSystemNode)));
      } catch (error) {
        console.error('加载项目列表失败:', error);
      }
    };

    loadProjects();
  }, [isPersonalSpace]);

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
    const targetId = newBreadcrumb[newBreadcrumb.length - 1].id;
    loadNodes(targetId);
    setSearchQuery('');
    setCurrentPage(1);
  }, [breadcrumb, loadNodes]);

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
  }, [nodes, currentOpenFileId, isModified, searchQuery]);

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
    if (currentPage > 1 && breadcrumb.length > 0) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      const currentNodeId = breadcrumb[breadcrumb.length - 1].id;
      loadNodes(currentNodeId, newPage);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && breadcrumb.length > 0) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      const currentNodeId = breadcrumb[breadcrumb.length - 1].id;
      loadNodes(currentNodeId, newPage);
    }
  };

  // 滚动加载更多
  const handleLoadMore = useCallback(() => {
    if (breadcrumb.length > 0 && hasMore && !loading) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      const currentNodeId = breadcrumb[breadcrumb.length - 1].id;
      loadNodes(currentNodeId, newPage, searchQuery, true);
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

  // "我的项目"模式下未选择项目时：显示项目列表
  if (!isPersonalSpace && !selectedProjectId && !loading) {
    return (
      <div className={styles.projectDrawingsPanel}>
        {/* 项目列表标题 */}
        <div className={styles.sectionTitle}>
          <FolderOpen size={16} />
          <span>我的项目 ({projects.length})</span>
        </div>

        {/* 项目列表 */}
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
              .map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  onClick={() => handleEnterProject(project)}
                />
              ))
          )}
        </div>
      </div>
    );
  }

  // 面包屑导航
  const breadcrumbElement = (
    <div className={styles.breadcrumb}>
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
      {breadcrumb.map((item, index) => (
        <React.Fragment key={item.id}>
          {(isPersonalSpace || index > 0) && index > 0 && (
            <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          )}
          <button
            className={`${styles.breadcrumbItem} ${index === breadcrumb.length - 1 ? styles.active : ''}`}
            onClick={() => handleBreadcrumbClick(index)}
            disabled={index === breadcrumb.length - 1}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className={styles.projectDrawingsPanel}>
      <ResourceList
        items={resourceItems}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          setCurrentPage(1); // 搜索时重置到第一页
          if (breadcrumb.length > 0) {
            loadNodes(breadcrumb[breadcrumb.length - 1].id, 1, query);
          }
        }}
        onItemClick={handleItemClick}
        emptyText={searchQuery ? '未找到匹配的内容' : '当前目录为空'}
        defaultViewMode="list"
        actions={paginationActions}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        breadcrumb={(breadcrumb.length > 0 || !isPersonalSpace) ? breadcrumbElement : undefined}
      />
    </div>
  );
};

export default ProjectDrawingsPanel;
