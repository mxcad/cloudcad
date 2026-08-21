import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Button } from './ui/Button';
import { CollabWorkCard } from './CollabWorkCard';
import type { WorkListItem } from '../hooks/useCollabWorks';
import styles from './CollaborateSidebar.module.css';
import { t } from '@/languages';

/** 按图纸聚合的分组：key=drawingKey，label=图纸名 */
interface DrawingGroup {
  key: string;
  label: string;
  isLocal: boolean;
  items: WorkListItem[];
}

interface WorkListPanelProps {
  myWorks: WorkListItem[];
  projectWorks: WorkListItem[];
  loading: boolean;
  currentWorkId: number | null;
  joiningWorkId: number | null;
  onJoinWork: (workId: number) => void;
  onExitWork: () => void;
  onRefresh: () => void;
}

/** 按图纸唯一标识（本地=fileHash，云图=nodeId）聚合协同卡片 */
function groupByDrawing(items: WorkListItem[]): DrawingGroup[] {
  const order: string[] = [];
  const map = new Map<string, DrawingGroup>();
  for (const item of items) {
    const key = item.drawingKey || '__unknown__';
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: item.drawingName,
        isLocal: item.sourceType === 'local',
        items: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }
  return order.map((k) => map.get(k)!);
}

export const WorkListPanel: React.FC<WorkListPanelProps> = ({
  myWorks,
  projectWorks,
  loading,
  currentWorkId,
  joiningWorkId,
  onJoinWork,
  onExitWork,
  onRefresh,
}) => {
  const myGroups = useMemo(() => groupByDrawing(myWorks), [myWorks]);
  const projectGroups = useMemo(
    () => groupByDrawing(projectWorks),
    [projectWorks]
  );

  if (loading) {
    return (
      <div className={styles.workListPanel}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>{t('加载中...')}</span>
        </div>
      </div>
    );
  }

  const hasMyWorks = myWorks.length > 0;
  const hasProjectWorks = projectWorks.length > 0;

  if (!hasMyWorks && !hasProjectWorks) {
    return (
      <div className={styles.workListPanel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Users size={20} />
          </div>
          <div className={styles.emptyTitle}>{t('暂无活跃协同')}</div>
          <div className={styles.emptyDescription}>
            {t('当前没有可加入的协同会话')}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={onRefresh}
            style={{ marginTop: '12px' }}
          >
            {t('刷新')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workListPanel}>
      {hasMyWorks && (
        <div className={styles.workListGroup}>
          <div className={styles.workListGroupLabel}>{t('我创建的')}</div>
          {myGroups.map((group) => (
            <div
              key={group.key}
              className={styles.drawingGroup}
            >
              <div className={styles.drawingGroupHeader}>
                <span className={styles.drawingGroupTitle}>
                  {group.label}
                </span>
                {group.isLocal && (
                  <span className={styles.workCardLocalTag}>
                    {t('本地')}
                  </span>
                )}
                <span className={styles.drawingGroupCount}>
                  {group.items.length}
                  {t('个协同')}
                </span>
              </div>
              <div className={styles.drawingGroupBody}>
                {group.items.map((item) => (
                  <CollabWorkCard
                    key={item.work.work_id}
                    work={item.work}
                    isActive={item.work.work_id === currentWorkId}
                    isJoined={
                      item.isJoined || item.work.work_id === currentWorkId
                    }
                    isJoining={joiningWorkId === item.work.work_id}
                    drawingName={item.drawingName}
                    projectName={item.projectName}
                    onJoin={onJoinWork}
                    onExit={onExitWork}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasProjectWorks && (
        <div className={styles.workListGroup}>
          <div className={styles.workListGroupLabel}>{t('项目协同')}</div>
          {projectGroups.map((group) => (
            <div
              key={group.key}
              className={styles.drawingGroup}
            >
              <div className={styles.drawingGroupHeader}>
                <span className={styles.drawingGroupTitle}>
                  {group.label}
                </span>
                {group.isLocal && (
                  <span className={styles.workCardLocalTag}>
                    {t('本地')}
                  </span>
                )}
                <span className={styles.drawingGroupCount}>
                  {group.items.length}
                  {t('个协同')}
                </span>
              </div>
              <div className={styles.drawingGroupBody}>
                {group.items.map((item) => (
                  <CollabWorkCard
                    key={item.work.work_id}
                    work={item.work}
                    isActive={item.work.work_id === currentWorkId}
                    isJoined={
                      item.isJoined || item.work.work_id === currentWorkId
                    }
                    isJoining={joiningWorkId === item.work.work_id}
                    drawingName={item.drawingName}
                    projectName={item.projectName}
                    onJoin={onJoinWork}
                    onExit={onExitWork}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkListPanel;
