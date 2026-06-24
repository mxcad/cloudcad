import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus, FolderPlus, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { MxCadUploaderRef } from '@/components/MxCadUploader';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { FileSystemToolbar, ProjectFilterTabs } from '@/pages/components';
import { RefreshIcon } from '@/components/FileIcons';
import type { FileSystemNode } from '@/types/filesystem';
import type { ProjectFilterType } from '@/api-sdk';
import type { SearchFilterValues } from '@/components/search/SearchFilters';

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot?: boolean;
}

interface FileSystemHeaderProps {
  mode: 'project' | 'personal-space';
  isAtRoot: boolean;
  isTrashView: boolean;
  isPersonalSpaceMode: boolean;
  isProjectRootMode: boolean;
  loading: boolean;
  isFetching: boolean;
  searchTerm: string;
  viewMode: 'grid' | 'list';
  selectedNodes: Set<string>;
  nodesCount: number;
  projectFilter: ProjectFilterType;
  breadcrumbs: BreadcrumbItem[];
  canCreateProject: boolean;
  uploaderRef: React.RefObject<MxCadUploaderRef>;
  getCurrentParentId: () => string;
  onSetSearchTerm: (term: string) => void;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onSearchSubmit: () => void;
  onSelectAll: () => void;
  onToggleTrashView: () => void;
  onClearTrash?: (projectId?: string) => void;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  onRefresh: () => void;
  onCreateFolder?: () => void;
  onCreateProject?: () => void;
  onCreateDrawing?: () => void;
  onGoBack: () => void;
  onBreadcrumbNavigate: (crumb: BreadcrumbItem & { isRoot?: boolean }) => void;
  /** 面包屑路径提交（编辑模式） */
  onBreadcrumbPathSubmit?: (path: string) => void;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ) => void;
  clipboardCount?: number;
  clipboardMode?: string | null;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  searchFilters?: SearchFilterValues;
  onSearchFiltersChange?: (filters: SearchFilterValues) => void;
  /** 隐藏回收站按钮（用于公共资源库等无回收站的页面） */
  hideTrashButton?: boolean;
  /** 隐藏返回按钮 */
  hideBackButton?: boolean;
  /** 文件创建权限 */
  canCreate?: boolean;
  /** 文件上传权限 */
  canUpload?: boolean;
  /** 自定义右侧操作区（在创建/上传按钮之后、回收站和项目筛选之前渲染） */
  renderExtraActions?: React.ReactNode;
}

export const FileSystemHeader: React.FC<FileSystemHeaderProps> = ({
  mode: _mode,
  isAtRoot,
  isTrashView,
  isPersonalSpaceMode,
  isProjectRootMode,
  loading,
  isFetching,
  searchTerm,
  viewMode,
  selectedNodes,
  nodesCount,
  projectFilter,
  breadcrumbs,
  canCreateProject,
  uploaderRef,
  getCurrentParentId,
  onSetSearchTerm,
  onSetViewMode,
  onSearchSubmit,
  onSelectAll,
  onToggleTrashView,
  onClearTrash,
  onProjectFilterChange,
  onRefresh,
  onCreateFolder,
  onCreateProject,
  onCreateDrawing,
  onGoBack,
  onBreadcrumbNavigate,
  onBreadcrumbPathSubmit,
  showToast,
  clipboardCount = 0,
  clipboardMode,
  onCopy,
  onCut,
  onPaste,
  searchFilters,
  onSearchFiltersChange,
  hideTrashButton = false,
  hideBackButton = false,
  canCreate = true,
  canUpload = true,
  renderExtraActions,
}) => {
  const navigate = useNavigate();

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

  useEffect(() => {
    if (breadcrumbRef.current && breadcrumbs.length > 0) {
      breadcrumbRef.current.scrollTo({
        left: breadcrumbRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [breadcrumbs]);

  const handleBackButton = () => {
    if (isTrashView) {
      onToggleTrashView();
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
    onBreadcrumbNavigate(crumb);
  };

  return (
    <Card
      variant="outlined"
      radius="2xl"
      className="backdrop-blur-xl p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {!hideBackButton && (
            <Tooltip
              content={
                isPersonalSpaceMode
                  ? isAtRoot
                    ? '返回我的图纸'
                    : '返回上一级'
                  : isAtRoot
                    ? '返回项目列表'
                    : '返回上一级'
              }
            >
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
          )}

          <div
            ref={breadcrumbRef}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={
                breadcrumbs as unknown as Parameters<
                  typeof BreadcrumbNavigation
                >[0]['breadcrumbs']
              }
              onNavigate={handleBreadcrumbNav}
              editable={!isTrashView && !isAtRoot}
              onPathSubmit={onBreadcrumbPathSubmit}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content="刷新">
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
              style={{ color: 'var(--text-tertiary)' }}
              className="hover:bg-[var(--bg-tertiary)]"
            >
              <RefreshIcon
                size={16}
                className={isFetching ? 'animate-spin' : ''}
              />
            </Button>
          </Tooltip>

          {isAtRoot ? (
            <>
              {canCreateProject &&
                !isPersonalSpaceMode &&
                !isTrashView &&
                projectFilter !== 'joined' && (
                  <Tooltip content="新建项目">
                    <Button
                      variant="secondary"
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
              {!isTrashView && canCreate && (
                <>
                  {onCreateDrawing && (
                    <Tooltip content="新建图纸">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onCreateDrawing}
                        disabled={loading}
                        className="hover:bg-[var(--bg-tertiary)]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <FilePlus size={16} />
                      </Button>
                    </Tooltip>
                  )}
                  {onCreateFolder && (
                    <Tooltip content="新建文件夹">
                      <Button
                        variant="secondary"
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
                  )}
                </>
              )}
            </>
          )}

          {!isAtRoot && !isTrashView && canUpload && (
            <Tooltip content="上传 CAD 文件">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => uploaderRef.current?.triggerUpload()}
                disabled={loading}
                className="hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Upload size={16} />
              </Button>
            </Tooltip>
          )}

          {renderExtraActions}

          {!hideTrashButton && (
            <Button
              variant={isTrashView ? 'primary' : 'ghost'}
              size="sm"
              onClick={onToggleTrashView}
              disabled={loading}
              className={isTrashView ? '' : 'hover:bg-[var(--bg-tertiary)]'}
              style={isTrashView ? {} : { color: 'var(--text-tertiary)' }}
              title={isTrashView ? '返回文件列表' : '回收站'}
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
              回收站
            </Button>
          )}
        </div>
      </div>

      {isAtRoot && (
        <ProjectFilterTabs
          isTrashView={isTrashView}
          projectFilter={projectFilter}
          onProjectFilterChange={onProjectFilterChange}
          isProjectRootMode={isProjectRootMode}
          nodesCount={nodesCount}
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
        loading={loading}
        isTrashView={isTrashView}
        onClearTrash={onClearTrash ? () => onClearTrash() : undefined}
        trashItemsCount={isTrashView ? nodesCount : 0}
        isAtRoot={isAtRoot}
        isProjectRootMode={isProjectRootMode}
        searchFilters={searchFilters}
        onSearchFiltersChange={onSearchFiltersChange}
      />
    </Card>
  );
};
