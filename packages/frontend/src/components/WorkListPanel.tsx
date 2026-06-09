import React from 'react';
import { Users } from 'lucide-react';
import { Button } from './ui/Button';
import { parseWorkData } from '../types/collaboration';
import { CollabWorkCard } from './CollabWorkCard';
import type { WorkData } from './CollabWorkCard';
import styles from './CollaborateSidebar.module.css';

interface WorkListItem {
  work: WorkData;
  projectName: string;
  drawingName: string;
  isCurrentFile: boolean;
  isJoined: boolean;
  onlineCount: number;
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
  if (loading) {
    return (
      <div className={styles.workListPanel}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>加载中...</span>
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
          <div className={styles.emptyTitle}>暂无活跃协同</div>
          <div className={styles.emptyDescription}>
            当前没有可加入的协同会话
          </div>
          <Button variant="primary" size="sm" onClick={onRefresh} style={{ marginTop: '12px' }}>
            刷新
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workListPanel}>
      {hasMyWorks && (
        <div className={styles.workListGroup}>
          <div className={styles.workListGroupLabel}>我创建的</div>
          <div className={styles.workListGroupBody}>
            {myWorks.map((item) => (
              <CollabWorkCard
                key={item.work.work_id}
                work={item.work}
                isActive={item.work.work_id === currentWorkId}
                isJoined={item.isJoined || item.work.work_id === currentWorkId}
                isJoining={joiningWorkId === item.work.work_id}
                drawingName={item.drawingName}
                projectName={item.projectName}
                onJoin={onJoinWork}
                onExit={onExitWork}
              />
            ))}
          </div>
        </div>
      )}

      {hasProjectWorks && (
        <div className={styles.workListGroup}>
          <div className={styles.workListGroupLabel}>项目协同</div>
          <div className={styles.workListGroupBody}>
            {projectWorks.map((item) => (
              <CollabWorkCard
                key={item.work.work_id}
                work={item.work}
                isActive={item.work.work_id === currentWorkId}
                isJoined={item.isJoined || item.work.work_id === currentWorkId}
                isJoining={joiningWorkId === item.work.work_id}
                drawingName={item.drawingName}
                projectName={item.projectName}
                onJoin={onJoinWork}
                onExit={onExitWork}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkListPanel;
