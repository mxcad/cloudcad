///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import MxCadUppyUploader, { MxCadUppyUploaderRef } from '@/components/MxCadUppyUploader';
import { BreadcrumbNavigation } from '@/components/BreadcrumbNavigation';
import { FileSystemToolbar, ProjectFilterTabs } from '@/pages/components';
import { RefreshIcon } from '@/components/FileIcons';
import type { FileSystemNode } from '@/types/filesystem';
import type { ProjectFilterType } from '@/services/projectApi';

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
  searchTerm: string;
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  selectedNodes: Set<string>;
  nodesCount: number;
  projectFilter: ProjectFilterType;
  breadcrumbs: BreadcrumbItem[];
  canCreateProject: boolean;
  uploaderRef: React.RefObject<MxCadUppyUploaderRef>;
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
    if (isPersonalSpaceMode) {
      if (isAtRoot) {
        onSetSearchTerm('');
        navigate('/personal-space');
        return;
      }
      if (isTrashView) {
        // isTrashView setIs handled by parent
        onGoBack();
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
    if (isTrashView) {
      onGoBack();
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
              breadcrumbs={breadcrumbs as any}
              onNavigate={handleBreadcrumbNav}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
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
                !isProjectTrashView && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCreateProject}
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
              {!isTrashView && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCreateFolder}
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
            <MxCadUppyUploader
              ref={uploaderRef}
              nodeId={() => getCurrentParentId()}
              buttonText=""
              buttonClassName="hidden"
              onSuccess={onRefresh}
              onExternalReferenceSuccess={onRefresh}
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
    </div>
  );
};
