import React from 'react';
import { Button } from '../../components/ui/Button';
import { RefreshIcon } from '../../components/FileIcons';
import type { ProjectFilterType } from '@/types/project';

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
  isFetching: boolean;
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
  isFetching = false,
}) => {
  return (
    <div
      className="flex items-center gap-2 border-b"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <Button
        variant="ghost"
        onClick={() => isProjectTrashView && onToggleProjectTrashView()}
        className={`border-b-2 ${
          !isProjectTrashView ? 'border-primary-600' : 'border-transparent'
        }`}
        style={{
          color: !isProjectTrashView ? 'var(--primary-500)' : 'var(--text-tertiary)',
        }}
      >
        我的项目
      </Button>
      <Button
        variant="ghost"
        onClick={() => !isProjectTrashView && onToggleProjectTrashView()}
        className={`border-b-2 ${
          isProjectTrashView ? 'border-primary-600' : 'border-transparent'
        }`}
        style={{
          color: isProjectTrashView ? 'var(--primary-500)' : 'var(--text-tertiary)',
        }}
      >
        项目回收站
      </Button>

      {!isProjectTrashView && isProjectRootMode && (
        <div
          className="flex items-center gap-1 ml-4 pl-4 border-l"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {projectFilterTabs.map((tab) => (
            <Button
              key={tab.key}
              variant="ghost"
              size="sm"
              onClick={() => onProjectFilterChange(tab.key)}
              style={{
                background: projectFilter === tab.key ? 'var(--bg-tertiary)' : 'transparent',
                color: projectFilter === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {tab.label}
            </Button>
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
            <RefreshIcon size={14} className={isFetching ? 'animate-spin mr-1' : 'mr-1'} />
            刷新
          </Button>
        </div>
      )}
    </div>
  );
};
