import React from 'react';
import { Tab, Tabs, Button } from '@/components/ui';
import { RefreshIcon } from '../../components/FileIcons';
import type { ProjectFilterType } from '@/api-sdk';
import { t } from '@/languages';

interface ProjectFilterTabsProps {
  isTrashView: boolean;
  projectFilter: ProjectFilterType;
  onProjectFilterChange: (filter: ProjectFilterType) => void;
  isProjectRootMode: boolean;
  nodesCount: number;
  onRefresh: () => void;
  loading: boolean;
  isFetching: boolean;
}

function getProjectFilterTabs(): { key: ProjectFilterType; label: string }[] {
  return [
    { key: 'all', label: t('全部') },
    { key: 'owned', label: t('我创建的') },
    { key: 'joined', label: t('我加入的') },
  ];
}

export const ProjectFilterTabs: React.FC<ProjectFilterTabsProps> = ({
  isTrashView,
  projectFilter,
  onProjectFilterChange,
  isProjectRootMode,
  nodesCount,
  onRefresh,
  loading,
  isFetching = false,
}) => {
  return (
    <div
      className="flex items-center gap-2 border-b"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <Tabs>
        <Tab
          active={!isTrashView}
          onClick={() => {}}
        >
          {t("我的项目")}
        </Tab>

        {!isTrashView && isProjectRootMode && (
          <>
            <div
              className="mx-1 h-5 w-px"
              style={{ backgroundColor: 'var(--border-default)' }}
            />
            {getProjectFilterTabs().map((tab) => (
              <Tab
                key={tab.key}
                active={projectFilter === tab.key}
                onClick={() => onProjectFilterChange(tab.key)}
              >
                {tab.label}
              </Tab>
            ))}
          </>
        )}
      </Tabs>

      {isTrashView && nodesCount > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            style={{ color: 'var(--text-tertiary)' }}
            title={t("刷新")}
          >
            <RefreshIcon size={14} className={isFetching ? 'animate-spin mr-1' : 'mr-1'} />
            {t("刷新")}
          </Button>
        </div>
      )}
    </div>
  );
};
