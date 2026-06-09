import React, { useMemo } from 'react';
import { Users, UserPlus, Share2, Copy, Loader2, LogOut } from 'lucide-react';
import { Button } from './ui/Button';
import { deduplicateWorkUsers } from '../types/collaboration';
import styles from './CollaborateSidebar.module.css';

interface Work {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface CurrentFilePanelProps {
  work: Work | undefined;
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
  onShare: () => void;
  onCopyShareLink: () => void;
}

function parseWorkData(raw: string): { drawingId?: string; projectId?: string | null } | null {
  try {
    const decoded = atob(raw);
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

export const CurrentFilePanel: React.FC<CurrentFilePanelProps> = ({
  work,
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
  onShare,
  onCopyShareLink,
}) => {
  const isJoined = currentWorkId !== null && work?.work_id === currentWorkId;

  const deduplicated = useMemo(
    () => (work ? deduplicateWorkUsers(work.link_user_ids, work.link_user_data) : null),
    [work]
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

  const renderScenarioA = () => (
    <div className={styles.statusCard}>
      <div className={styles.statusHeader}>
        <span className={styles.statusFileName}>{fileName}</span>
      </div>
      <div className={styles.statusBody}>
        <div className={styles.statusIcon}>
          <Users size={20} />
        </div>
        <div className={styles.statusTitle}>暂无协同</div>
        <div className={styles.statusDesc}>创建协同以开始实时协作</div>
        <Button variant="primary" loading={creating} icon={UserPlus} onClick={onCreateWork} data-tour="create-collaborate-btn">
          {creating ? '创建中...' : '创建协同'}
        </Button>
      </div>
    </div>
  );

  const renderScenarioB = () => (
    <div className={styles.statusCard}>
      <div className={styles.statusHeader}>
        <span className={styles.statusFileName}>{fileName}</span>
        <span className={styles.statusAvailableBadge}>
          <span className={styles.statusDotStatic} />
          协同可用
        </span>
      </div>
      <div className={styles.statusBody}>
        <div className={styles.participantAvatars}>
          {deduplicated!.linkUserData.slice(0, 8).map((ud, i) => {
            const userData = (() => {
              try { return JSON.parse(atob(ud)); } catch { return null; }
            })();
            return (
              <div key={i} className={styles.avatar} title={userData?.name ?? `用户${i + 1}`}>
                {userData?.avatar ? (
                  <img src={userData.avatar} alt="" className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarFallback}>
                    {(userData?.name ?? '?')[0]}
                  </span>
                )}
              </div>
            );
          })}
          {deduplicated!.linkUserData.length > 8 && (
            <div className={`${styles.avatar} ${styles.avatarMore}`}>
              +{deduplicated!.linkUserData.length - 8}
            </div>
          )}
        </div>
        <div className={styles.onlineCount}>
          {deduplicated!.linkUserIds.length} 人在线
        </div>
        <Button
          variant="primary"
          icon={UserPlus}
          loading={joiningWorkId === work!.work_id}
          onClick={() => onJoinWork(work!.work_id)}
          data-tour="join-collaborate-btn"
        >
          加入协同
        </Button>
      </div>
    </div>
  );

  const renderScenarioC = () => (
    <div className={styles.statusCard}>
      <div className={styles.statusHeader}>
        <span className={styles.statusFileName}>{fileName}</span>
        <span className={styles.statusLiveBadge}>
          <span className={styles.statusDot} />
          协同进行中
        </span>
      </div>
      <div className={styles.statusBody}>
        <div className={styles.participantAvatars}>
          {deduplicated!.linkUserData.slice(0, 8).map((ud, i) => {
            const userData = (() => {
              try { return JSON.parse(atob(ud)); } catch { return null; }
            })();
            return (
              <div key={i} className={styles.avatar} title={userData?.name ?? `用户${i + 1}`}>
                {userData?.avatar ? (
                  <img src={userData.avatar} alt="" className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarFallback}>
                    {(userData?.name ?? '?')[0]}
                  </span>
                )}
              </div>
            );
          })}
          {deduplicated!.linkUserData.length > 8 && (
            <div className={`${styles.avatar} ${styles.avatarMore}`}>
              +{deduplicated!.linkUserData.length - 8}
            </div>
          )}
        </div>
        <div className={styles.onlineCount}>
          {deduplicated!.linkUserIds.length} 人在线
        </div>
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          {fromShare ? (
            <Button variant="secondary" icon={Copy} onClick={onCopyShareLink} style={{ flex: 1 }}>
              复制分享链接
            </Button>
          ) : (
            <Button variant="secondary" icon={Share2} onClick={onShare} style={{ flex: 1 }}>
              分享
            </Button>
          )}
          <Button variant="danger" icon={LogOut} onClick={onExitWork} style={{ flex: 1 }}>
            退出
          </Button>
        </div>
      </div>
    </div>
  );

  const renderScenarioWaiting = () => (
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
          等待协同会话就绪，或手动创建协同
        </div>
        <Button variant="primary" loading={creating} icon={UserPlus} onClick={onCreateWork} data-tour="create-collaborate-btn">
          {creating ? '创建中...' : '创建协同'}
        </Button>
      </div>
    </div>
  );

  const panel = (() => {
    if (!work) {
      if (waitingForSession) {
        return renderScenarioWaiting();
      }
      return renderScenarioA();
    }
    if (isJoined) return renderScenarioC();
    return renderScenarioB();
  })();

  return (
    <div className={styles.currentFilePanel}>
      {panel}
    </div>
  );
};

export default CurrentFilePanel;
