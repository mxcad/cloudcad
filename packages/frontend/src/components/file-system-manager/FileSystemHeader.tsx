import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { RefreshIcon, SearchIcon, GridIcon, ListIcon } from '../FileIcons';
import { FolderPlus } from 'lucide-react';
import { BreadcrumbNavigation } from '../BreadcrumbNavigation';
import { BreadcrumbItem } from '../../types/filesystem';

interface FileSystemHeaderProps {
  isAtRoot: boolean;
  breadcrumbs: BreadcrumbItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearchSubmit: () => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
  selectedNodes: Set<string>;
  nodesCount: number;
  loading: boolean;
  onGoBack: () => void;
  onRefresh: () => void;
  onCreateFolder: () => void;
  onCreateProject: () => void;
  onSelectAll: () => void;
  breadcrumbRef: React.RefObject<HTMLDivElement>;
  projectId: string;
  isPersonalSpaceMode?: boolean;
}

export const FileSystemHeader: React.FC<FileSystemHeaderProps> = ({
  isAtRoot,
  breadcrumbs,
  searchQuery,
  setSearchQuery,
  handleSearchSubmit,
  viewMode,
  setViewMode,
  isMultiSelectMode,
  setIsMultiSelectMode,
  selectedNodes,
  nodesCount,
  loading,
  onGoBack,
  onRefresh,
  onCreateFolder,
  onCreateProject,
  onSelectAll,
  breadcrumbRef,
  projectId,
  isPersonalSpaceMode = false,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={
              isPersonalSpaceMode
                ? isAtRoot
                  ? () => navigate('/personal-space')
                  : onGoBack
                : isAtRoot
                  ? () => navigate('/projects')
                  : onGoBack
            }
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
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
                if (isPersonalSpaceMode) {
                  if (crumb.isRoot) {
                    navigate('/personal-space');
                  } else {
                    navigate(`/personal-space/${crumb.id}`);
                  }
                } else {
                  if (crumb.isRoot) {
                    navigate('/projects');
                  } else {
                    navigate(`/projects/${projectId}/files/${crumb.id}`);
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
            onClick={onRefresh}
            disabled={loading}
            className="text-slate-600 hover:bg-slate-100"
            title="刷新"
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </Button>

          {isAtRoot ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateProject}
              className="text-slate-600 hover:bg-slate-100"
              title="新建项目"
            >
              <FolderPlus size={16} />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCreateFolder}
                disabled={loading}
                className="text-slate-600 hover:bg-slate-100"
                title="新建文件夹"
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
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="relative group flex-1 max-w-xs">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors"
          />
          <input
            type="text"
            placeholder="搜索文件或项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchSubmit();
              }
            }}
            className="w-full pl-9 pr-20 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                title="清除搜索"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              onClick={handleSearchSubmit}
              className="text-primary-500 hover:text-primary-600 transition-colors p-1"
              title="搜索"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isMultiSelectMode ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
            }}
            className={
              isMultiSelectMode ? '' : 'text-slate-600 hover:bg-slate-100'
            }
            title="多选模式"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
            </svg>
          </Button>

          {isMultiSelectMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              className="text-slate-600 hover:bg-slate-100"
              title={selectedNodes.size === nodesCount ? '取消全选' : '全选'}
            >
              {selectedNodes.size === nodesCount ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              )}
            </Button>
          )}

          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className="p-2 transition-colors"
            >
              <GridIcon size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => setViewMode('list')}
              className="p-2 transition-colors"
            >
              <ListIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
