import React from 'react';
import { Button } from '../../components/ui/Button';
import { RefreshIcon } from '../../components/FileIcons';
import type { ProjectFilterType } from '../../services/projectsApi';

interface ProjectFilterTabsProps {
  isProjectTrashView: boolean;
  onToggleProjectTrashView: () => void;
  projectFilter: ProjectFilterType;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  isProjectRootMode: boolean;
  nodesCount: number;
  onClearTrash: () => void;
  onRefresh: () => void;
  loading: boolean;
}

const projectFilterTabs: { key: ProjectFilterType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'owned', label: '我创建的' },
  { key: 'joined', label: '我加入的' },
];

export const ProjectFilterTabs: React.FC<ProjectFilterTabsProps> = ({
  isProjectTrashView,
  onToggleProjectTrashView,
  projectFilter,
  onProjectFilterChange,
  isProjectRootMode,
  nodesCount,
  onClearTrash,
  onRefresh,
  loading,
}) => {
  return (
    <div
      className="flex items-center gap-2 border-b"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <button
        onClick={() => isProjectTrashView && onToggleProjectTrashView()}
        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
          !isProjectTrashView ? 'border-primary-600' : 'border-transparent'
        }`}
        style={{
          color: !isProjectTrashView ? 'var(--primary-500)' : 'var(--text-tertiary)',
        }}
      >
        我的项目
      </button>
      <button
        onClick={() => !isProjectTrashView && onToggleProjectTrashView()}
        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
          isProjectTrashView ? 'border-primary-600' : 'border-transparent'
        }`}
        style={{
          color: isProjectTrashView ? 'var(--primary-500)' : 'var(--text-tertiary)',
        }}
      >
        项目回收站
      </button>

      {!isProjectTrashView && isProjectRootMode && (
        <div
          className="flex items-center gap-1 ml-4 pl-4 border-l"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {projectFilterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onProjectFilterChange(tab.key)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200"
              style={{
                background: projectFilter === tab.key ? 'var(--bg-tertiary)' : 'transparent',
                color: projectFilter === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {isProjectTrashView && nodesCount > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClearTrash}
            style={{ color: 'var(--error)', borderColor: 'var(--error-dim)' }}
            className="hover:bg-[var(--error-dim)]"
            title="清空回收站"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            清空回收站
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            style={{ color: 'var(--text-tertiary)' }}
            title="刷新"
          >
            <RefreshIcon size={14} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
            刷新
          </Button>
        </div>
      )}
    </div>
  );
};
