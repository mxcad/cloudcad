import React from 'react';
import { Users, Check } from 'lucide-react';
import { Button } from './ui/Button';
import styles from './CollaborateSidebar.module.css';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface WorkListItem {
  work: Work;
  projectName: string;
  drawingName: string;
  isCurrentFile: boolean;
  isJoined: boolean;
  onlineCount: number;
}

interface WorkListPanelProps {
  items: WorkListItem[];
  loading: boolean;
  currentWorkId: number | null;
  joiningWorkId: number | null;
  onJoinWork: (workId: number) => void;
  onRefresh: () => void;
}

export const WorkListPanel: React.FC<WorkListPanelProps> = ({
  items,
  loading,
  currentWorkId,
  joiningWorkId,
  onJoinWork,
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

  if (items.length === 0) {
    return (
      <div className={styles.workListPanel}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Users size={20} />
          </div>
          <div className={styles.emptyTitle}>暂无活跃协同</div>
          <div className={styles.emptyDescription}>
            当前项目中没有活跃的协同会话
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
      <div className={styles.workListHeader}>
        <span className={styles.workListHeaderLabel}>项目</span>
        <span className={styles.workListHeaderLabel}>图纸</span>
        <span className={styles.workListHeaderLabel}>在线</span>
        <span className={styles.workListHeaderLabel}>操作</span>
      </div>
      <div className={styles.workListBody}>
        {items.map((item) => {
          const isJoined = item.isJoined || item.work.work_id === currentWorkId;
          return (
            <div
              key={item.work.work_id}
              className={`${styles.workListRow} ${item.isCurrentFile ? styles.workListRowCurrent : ''}`}
            >
              <span className={styles.workListCell} title={item.projectName}>
                {item.isCurrentFile && <span className={styles.currentMarker}>📌</span>}
                {item.projectName}
              </span>
              <span className={styles.workListCell} title={item.drawingName}>
                {item.drawingName}
              </span>
              <span className={styles.workListCell}>
                {item.onlineCount}人
              </span>
              <span className={styles.workListCell}>
                {isJoined ? (
                  <span className={styles.joinedBadge}>
                    <Check size={10} />
                    已加入
                  </span>
                ) : (
                  <Button
                    variant="primary"
                    size="xs"
                    loading={joiningWorkId === item.work.work_id}
                    disabled={currentWorkId !== null}
                    onClick={() => onJoinWork(item.work.work_id)}
                  >
                    加入
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkListPanel;
