///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilePlus, FolderPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import MxCadUploader, { MxCadUploaderRef } from '@/components/MxCadUploader';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { FileSystemToolbar, ProjectFilterTabs } from '@/pages/components';
import { RefreshIcon } from '@/components/FileIcons';
import type { FileSystemNode } from '@/types/filesystem';
import type { ProjectFilterType } from '@/types/project';

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot?: boolean;
}

interface FileSystemHeaderProps {
  mode: 'project' | 'personal-space';
  isAtRoot: boolean;
  isTrashView: boolean;
  isProjectTrashView: boolean;
  isPersonalSpaceMode: boolean;
  isProjectRootMode: boolean;
  loading: boolean;
  isFetching: boolean;
  searchTerm: string;
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  selectedNodes: Set<string>;
  nodesCount: number;
  projectFilter: ProjectFilterType;
  breadcrumbs: BreadcrumbItem[];
  canCreateProject: boolean;
  uploaderRef: React.RefObject<MxCadUploaderRef>;
  getCurrentParentId: () => string;
  onSetSearchTerm: (term: string) => void;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onSetIsMultiSelectMode: (mode: boolean) => void;
  onSearchSubmit: () => void;
  onSelectAll: () => void;
  onToggleTrashView: () => void;
  onToggleProjectTrashView: () => void;
  onClearProjectTrash: () => void;
  onClearTrash: () => void;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  onRefresh: () => void;
  onCreateFolder: () => void;
  onCreateDrawing: () => void;
  onCreateProject: () => void;
  onGoBack: () => void;
  onBreadcrumbNavigate: (crumb: BreadcrumbItem & { isRoot?: boolean }) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const FileSystemHeader: React.FC<FileSystemHeaderProps> = ({
  mode: _mode,
  isAtRoot,
  isTrashView,
  isProjectTrashView,
  isPersonalSpaceMode,
  isProjectRootMode,
  loading,
  isFetching,
  searchTerm,
  viewMode,
  isMultiSelectMode,
  selectedNodes,
  nodesCount,
  projectFilter,
  breadcrumbs,
  canCreateProject,
  uploaderRef,
  getCurrentParentId,
  onSetSearchTerm,
  onSetViewMode,
  onSetIsMultiSelectMode,
  onSearchSubmit,
  onSelectAll,
  onToggleTrashView,
  onToggleProjectTrashView,
  onClearProjectTrash,
  onClearTrash,
  onProjectFilterChange,
  onRefresh,
  onCreateFolder,
  onCreateDrawing,
  onCreateProject,
  onGoBack,
  onBreadcrumbNavigate,
  showToast,
}) => {
  const navigate = useNavigate();
  const params = useParams<{ projectId: string; nodeId?: string }>();

  // 面包屑滚轮横向滚动处理
  const breadcrumbRef = useRef<HTMLDivElement>(null);

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

  const handleBackButton = () => {
    // 如果在回收站视图，先退出回收站视图
    if (isTrashView) {
      onToggleTrashView();
      return;
    }
    if (isProjectTrashView) {
      onToggleProjectTrashView();
      return;
    }

    if (isPersonalSpaceMode) {
      if (isAtRoot) {
        onSetSearchTerm('');
        navigate('/personal-space');
        return;
      }
      onSetSearchTerm('');
      onGoBack();
      return;
    }

    if (isAtRoot) {
      onSetSearchTerm('');
      navigate('/projects');
      return;
    }
    onSetSearchTerm('');
    onGoBack();
  };

  const handleBreadcrumbNav = (crumb: BreadcrumbItem) => {
    onSetSearchTerm('');
    if (isTrashView) {
      // parent handles isTrashView reset
    }
    if (isPersonalSpaceMode) {
      if (crumb.isRoot) {
        navigate('/personal-space');
      } else {
        navigate(`/personal-space/${crumb.id}`);
      }
    } else {
      if (crumb.isRoot) {
        navigate(`/projects/${crumb.id}/files`);
      } else {
        navigate(`/projects/${params.projectId}/files/${crumb.id}`);
      }
    }
  };

  return (
    <Card
      variant="outlined"
      radius="2xl"
      className="backdrop-blur-xl p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <Tooltip content={isPersonalSpaceMode
            ? isAtRoot
              ? '返回我的图纸'
              : '返回上一级'
            : isAtRoot
              ? '返回项目列表'
              : '返回上一级'
          }>
            <button
              onClick={handleBackButton}
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
          </Tooltip>

          <div
            ref={breadcrumbRef}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs as unknown as Parameters<typeof BreadcrumbNavigation>[0]['breadcrumbs']}
              onNavigate={handleBreadcrumbNav}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content="刷新">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
              style={{ color: 'var(--text-tertiary)' }}
              className="hover:bg-[var(--bg-tertiary)]"
            >
              <RefreshIcon size={16} className={isFetching ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>

          {/* 回收站按钮 */}
          {!isAtRoot && (
            <Button
              variant={isTrashView ? 'primary' : 'ghost'}
              size="sm"
              onClick={onToggleTrashView}
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
              {canCreateProject &&
                !isPersonalSpaceMode &&
                !isProjectTrashView &&
                projectFilter !== 'joined' && (
                  <Tooltip content="新建项目">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCreateProject}
                      className="hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-tertiary)' }}
                      data-tour="create-project-btn"
                    >
                      <FolderPlus size={16} />
                    </Button>
                  </Tooltip>
                )}
            </>
          ) : (
            <>
              {!isTrashView && (
                <>
                  <Tooltip content="新建图纸">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCreateDrawing}
                      disabled={loading}
                      className="hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <FilePlus size={16} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="新建文件夹">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCreateFolder}
                      disabled={loading}
                      className="hover:bg-[var(--bg-tertiary)]"
                      style={{ color: 'var(--text-tertiary)' }}
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
                  </Tooltip>
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
              onSuccess={onRefresh}
              onExternalReferenceSuccess={onRefresh}
              openAfterUpload={false}
              onError={(err: string) => {
              }}
            />
          )}
        </div>
      </div>

      {/* 项目标签页 - 仅在项目根目录模式下显示 */}
      {isAtRoot && (
        <ProjectFilterTabs
          isProjectTrashView={isProjectTrashView}
          onToggleProjectTrashView={onToggleProjectTrashView}
          projectFilter={projectFilter}
          onProjectFilterChange={onProjectFilterChange}
          isProjectRootMode={isProjectRootMode}
          nodesCount={nodesCount}
          onClearTrash={onClearTrash}
          onRefresh={onRefresh}
          loading={loading}
          isFetching={isFetching}
        />
      )}

      <FileSystemToolbar
        searchTerm={searchTerm}
        onSearchChange={onSetSearchTerm}
        onSearchSubmit={onSearchSubmit}
        viewMode={viewMode}
        onViewModeChange={onSetViewMode}
        isMultiSelectMode={isMultiSelectMode}
        onMultiSelectModeChange={onSetIsMultiSelectMode}
        selectedNodes={selectedNodes}
        nodesCount={nodesCount}
        onSelectAll={onSelectAll}
        loading={loading}
        isTrashView={isTrashView}
        onClearTrash={onClearProjectTrash}
        isAtRoot={isAtRoot}
      />
    </Card>
  );
};
