///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useMemo, useRef } from 'react';
import { FolderOpen, Loader2, AlertTriangle } from 'lucide-react';
import type { FileSystemNode } from '@/types/filesystem';
import { FileItem } from '@/components/FileItem';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import type { ProjectFilterType } from '@/api-sdk';
import { Tab, Tabs } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { ScrollToTopButton } from '@/components/common/ScrollToTopButton';
import { useScrollPagination } from '@/hooks/common/useScrollPagination';
import { PAGE_SIZE } from '@/constants/pagination';
import styles from '@/components/sidebar/sidebar.module.css';
import { t } from '@/languages';

interface ProjectListViewProps {
  projects: FileSystemNode[];
  searchQuery: string;
  projectFilter: ProjectFilterType;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  nodePermissions: Map<
    string,
    {
      canEdit: boolean;
      canDelete: boolean;
      canManageMembers: boolean;
      canManageRoles: boolean;
    }
  >;
  onEnterProject: (project: FileSystemNode) => void;
  onEditProject: (project: FileSystemNode) => void;
  onShowMembers: (project: FileSystemNode) => void;
  onShowRoles: (project: FileSystemNode) => void;
  onShowOperationHistory?: (project: FileSystemNode) => void;
  onDeleteProject?: (project: FileSystemNode) => void;
  onCreateProject?: () => void;
  onRefresh?: () => void;
  currentOpenProjectId?: string | null;
  /** 分页/滚动：当前页 */
  currentPage?: number;
  /** 分页/滚动：总页数（初始 0：未同步时不误报「已经是最后一页」） */
  totalPages?: number;
  /** 分页/滚动：加载中 */
  loading?: boolean;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条） */
  loadError?: string | null;
  /** 失败条重试回调 */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（累计模型下由数据层维护；prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  /** 滚动触发的翻页（追加/前插由父层 useAccumulatedPagination 处理） */
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({
  projects,
  searchQuery,
  projectFilter,
  onProjectFilterChange,
  nodePermissions,
  onEnterProject,
  onEditProject,
  onShowMembers,
  onShowRoles,
  onShowOperationHistory,
  onDeleteProject,
  onCreateProject,
  onRefresh,
  currentOpenProjectId,
  currentPage = 1,
  totalPages = 0,
  loading = false,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  onScrollPageChange,
}) => {
  const filteredProjects = useMemo(
    () =>
      searchQuery
        ? projects.filter((p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : projects,
    [projects, searchQuery]
  );

  // 滚动分页统一控制器：滚动容器（listRef）与列表项容器（itemContainerRef，仅含项目 DOM）
  // 分离——底部骨架/失败条/回顶按钮是滚动容器子节点，不能混入 itemContainer
  // （children↔items 一一对应是 DOM 二分测页前提）
  const listRef = useRef<HTMLDivElement>(null);
  const itemContainerRef = useRef<HTMLDivElement>(null);
  const { showBottomLoader, showTopLoader, isLastPage } = useScrollPagination({
    containerRef: listRef,
    itemContainerRef,
    itemsLength: filteredProjects.length,
    pageSize: PAGE_SIZE,
    currentPage,
    totalPages,
    loading,
    enabled: !!onScrollPageChange,
    loadError,
    minLoadedPage,
    onPageChange: (page, direction) => onScrollPageChange?.(page, direction),
  });

  return (
    <div className={styles.projectDrawingsPanel}>
      {/* 创建按钮 */}
      {onCreateProject && (
        <div className="px-3 py-2">
          <button
            onClick={onCreateProject}
            className="w-full px-3 py-1 text-sm rounded-lg bg-[var(--primary-500)] text-white hover:bg-[var(--primary-600)] transition-colors"
          >
            {t('+ 创建项目')}
          </button>
        </div>
      )}

      {/* 项目过滤 Tab */}
      <Tabs>
        {[
          { key: 'all', label: t('全部') },
          { key: 'owned', label: t('我创建的') },
          { key: 'joined', label: t('我加入的') },
        ].map((tab) => (
          <Tab
            key={tab.key}
            active={projectFilter === tab.key}
            onClick={() => onProjectFilterChange(tab.key as ProjectFilterType)}
          >
            {tab.label}
          </Tab>
        ))}
      </Tabs>

      {/* 项目列表（滚动容器 + 列表项容器；relative：回顶按钮/框选以容器为 containing block） */}
      <div ref={listRef} className={`${styles.drawingList} relative`}>
        {/* 顶部加载指示（向上滚动加载进行中） */}
        {showTopLoader && (
          <div
            data-testid="project-list-top-loader"
            className="flex items-center justify-center gap-2 py-2 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span>{t('加载中...')}</span>
          </div>
        )}

        {loading &&
        filteredProjects.length === 0 ? null : filteredProjects.length === 0 ? (
          <div className={styles.emptyState}>
            <FolderOpen size={48} className={styles.emptyIcon} />
            <div className={styles.emptyText}>
              {t('暂无项目，请先创建项目')}
            </div>
          </div>
        ) : (
          /* 列表项容器：children 与 items 一一对应（骨架/失败条/回顶在其外） */
          <div ref={itemContainerRef}>
            {filteredProjects.map((project) => {
              const projectPerms = nodePermissions.get(project.id);
              return (
                <div key={`project-space-${project.id}`}>
                  <FileItem
                    node={project}
                    isSelected={false}
                    isActive={
                      !!currentOpenProjectId &&
                      project.id === currentOpenProjectId
                    }
                    viewMode="list"
                    isTrash={false}
                    forceCompactActions={true}
                    {...getFileItemPermissionProps(project, {
                      projectPermissions: {},
                      nodePermissions: projectPerms,
                      disableUpload: true,
                    })}
                    onSelect={() => {}}
                    onEnter={onEnterProject}
                    onDownload={() => {}}
                    onDelete={
                      projectPerms?.canDelete && onDeleteProject
                        ? () => onDeleteProject(project)
                        : undefined
                    }
                    onRename={() => {}}
                    onRefresh={onRefresh}
                    onEdit={
                      projectPerms?.canEdit
                        ? () => onEditProject(project)
                        : undefined
                    }
                    onShowMembers={
                      projectPerms?.canManageMembers
                        ? () => onShowMembers(project)
                        : undefined
                    }
                    onShowRoles={
                      projectPerms?.canManageRoles
                        ? () => onShowRoles(project)
                        : undefined
                    }
                    onShowOperationHistory={
                      onShowOperationHistory
                        ? () => onShowOperationHistory(project)
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* 底部指示：加载中提示 / 翻页失败提示 / 已经是最后一页（互斥） */}
        {filteredProjects.length > 0 &&
          (showBottomLoader ? (
            <div
              className="flex items-center justify-center gap-2 py-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span>{t('加载中...')}</span>
            </div>
          ) : loadError ? (
            <div
              data-testid="project-list-load-error"
              className="flex items-center justify-center gap-2 py-3 text-xs"
              style={{ color: 'var(--error)' }}
            >
              <AlertTriangle size={14} className="shrink-0" />
              <span className="max-w-[60%] truncate" title={loadError}>
                {loadError}
              </span>
              {onRetryLoadMore && (
                <Button variant="outline" size="xs" onClick={onRetryLoadMore}>
                  {t('重试')}
                </Button>
              )}
            </div>
          ) : isLastPage ? (
            <div
              className="flex items-center justify-center py-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('已经是最后一页')}
            </div>
          ) : null)}
        <ScrollToTopButton containerRef={listRef} />
      </div>
    </div>
  );
};
