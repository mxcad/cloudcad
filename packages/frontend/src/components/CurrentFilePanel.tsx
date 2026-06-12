import React, { useMemo } from 'react';
import { Users, UserPlus, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { CollabWorkCard } from './CollabWorkCard';
import type { WorkData } from './CollabWorkCard';
import styles from './CollaborateSidebar.module.css';

interface CurrentFilePanelProps {
  works: WorkData[];
  currentWorkId: number | null;
  fileName: string;
  isCadReady: boolean;
  creating: boolean;
  joiningWorkId: number | null;
  waitingForSession: boolean;
  fromShare: boolean;
  onCreateWork: () => void;
  onJoinWork: (workId: number) => void;
  onExitWork: () => void;
}

export const CurrentFilePanel: React.FC<CurrentFilePanelProps> = ({
  works,
  currentWorkId,
  fileName,
  isCadReady,
  creating,
  joiningWorkId,
  waitingForSession,
  fromShare,
  onCreateWork,
  onJoinWork,
  onExitWork,
}) => {
  const activeWork = useMemo(
    () => works.find((w) => w.work_id === currentWorkId),
    [works, currentWorkId]
  );

  const otherWorks = useMemo(
    () => works.filter((w) => w.work_id !== currentWorkId),
    [works, currentWorkId]
  );

  if (!isCadReady) {
    return (
      <div className={styles.currentFilePanel}>
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>当前图纸</div>
          <div className={styles.statusBody}>
            <div className={styles.statusIcon}>
              <Users size={20} />
            </div>
            <div className={styles.statusTitle}>等待编辑器就绪...</div>
            <div className={styles.statusDesc}>CAD 引擎加载中</div>
          </div>
        </div>
      </div>
    );
  }

  if (!fileName) {
    return (
      <div className={styles.currentFilePanel}>
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>当前图纸</div>
          <div className={styles.statusBody}>
            <div className={styles.statusIcon}>
              <Users size={20} />
            </div>
            <div className={styles.statusTitle}>暂无打开的图纸</div>
            <div className={styles.statusDesc}>请先在编辑器中打开图纸</div>
          </div>
        </div>
      </div>
    );
  }

  if (waitingForSession) {
    return (
      <div className={styles.currentFilePanel}>
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <span className={styles.statusFileName}>{fileName}</span>
          </div>
          <div className={styles.statusBody}>
            <div className={styles.statusIcon}>
              <Loader2 size={20} className="animate-spin" />
            </div>
            <div className={styles.statusTitle}>正在建立协同连接...</div>
            <div className={styles.statusDesc}>
              等待协同会话就绪
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.currentFilePanel}>
      <div className={styles.currentFilePanelHeader}>
        <div className={styles.currentFilePanelHeaderLeft}>
          <Users size={14} />
          <span className={styles.statusFileName}>{fileName}</span>
        </div>
        {(activeWork || currentWorkId !== null) && (
          <span className={styles.statusLiveBadge}>
            <span className={styles.statusDot} />
            协同中
          </span>
        )}
      </div>

      {works.length === 0 && !currentWorkId && (
        <div className={styles.statusCard}>
          <div className={styles.statusBody}>
            <div className={styles.statusIcon}>
              <Users size={20} />
            </div>
            <div className={styles.statusTitle}>暂无协同</div>
            <div className={styles.statusDesc}>创建协同以开始实时协作</div>
            <Button
              variant="primary"
              loading={creating}
              icon={UserPlus}
              onClick={onCreateWork}
              data-tour="create-collaborate-btn"
            >
              {creating ? '创建中...' : '创建协同'}
            </Button>
          </div>
        </div>
      )}

      {works.length === 0 && currentWorkId !== null && !activeWork && (
        <div className={styles.statusCard}>
          <div className={styles.statusBody}>
            <div className={styles.statusIcon}>
              <Users size={20} />
            </div>
            <div className={styles.statusTitle}>协同中</div>
            <div className={styles.statusDesc}>正在获取协同信息...</div>
          </div>
        </div>
      )}

      {activeWork && (
        <CollabWorkCard
          work={activeWork}
          isActive={true}
          isJoined={true}
          isJoining={false}
          onJoin={onJoinWork}
          onExit={onExitWork}
        />
      )}

      {otherWorks.length > 0 && (
        <div className={styles.otherWorksSection}>
          {otherWorks.map((w) => (
            <CollabWorkCard
              key={w.work_id}
              work={w}
              isActive={false}
              isJoined={false}
              isJoining={joiningWorkId === w.work_id}
              onJoin={onJoinWork}
              onExit={onExitWork}
            />
          ))}
        </div>
      )}

      {works.length > 0 && (
        <div className={styles.createNewRow}>
          <Button
            variant="outline"
            size="sm"
            icon={UserPlus}
            loading={creating}
            onClick={onCreateWork}
            style={{ width: '100%' }}
          >
            {creating ? '创建中...' : '创建新协同'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CurrentFilePanel;
