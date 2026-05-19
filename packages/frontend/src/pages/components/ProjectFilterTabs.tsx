import React from 'react';
import { Select, Button } from '@/components/ui';
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
      <Select
        value={isProjectTrashView ? 'trash' : 'projects'}
        onChange={(val) => {
          if ((val === 'trash') !== isProjectTrashView) {
            onToggleProjectTrashView();
          }
        }}
        options={[
          { value: 'projects', label: '我的项目' },
          { value: 'trash', label: '项目回收站' },
        ]}
        size="sm"
      />

      {!isProjectTrashView && isProjectRootMode && (
        <Select
          value={projectFilter}
          onChange={(val) => onProjectFilterChange(val as ProjectFilterType)}
          options={projectFilterTabs}
          size="sm"
        />
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
