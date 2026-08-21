import React, { useState } from 'react';
import { Share2, LogOut, UserPlus } from 'lucide-react';
import { Button } from './ui/Button';
import { UserAvatar } from './ui/UserAvatar';
import {
  deduplicateWorkUsers,
  parseWorkData,
  getWorkCreator,
} from '../types/collaboration';
import { CollabShareModal } from './CollabShareModal';
import { t } from '@/languages';
import styles from './CollaborateSidebar.module.css';

export interface WorkData {
  link_user_data: string[];
  link_user_ids: string[];
  real_user_id: string;
  work_data: string;
  work_id: number;
}

interface CollabWorkCardProps {
  work: WorkData;
  isActive: boolean;
  isJoined: boolean;
  isJoining: boolean;
  drawingName?: string;
  projectName?: string;
  onJoin: (workId: number) => void;
  onExit: () => void;
}

export const CollabWorkCard: React.FC<CollabWorkCardProps> = ({
  work,
  isActive,
  isJoined,
  isJoining,
  drawingName,
  projectName,
  onJoin,
  onExit,
}) => {
  const [showShare, setShowShare] = useState(false);
  const data = parseWorkData(work.work_data);
  const creator = data ? getWorkCreator(data) : {};
  const libraryKey = data?.v === 3 ? data.libraryKey : undefined;
  const isLocal = data?.v === 3 && data.sourceType === 'local';
  const onlineCount = work.link_user_ids.length;

  const deduped = deduplicateWorkUsers(work.link_user_ids, work.link_user_data);
  const participants = deduped.linkUserData.slice(0, 8);

  return (
    <div
      className={`${styles.workCard} ${isActive ? styles.workCardActive : ''}`}
      onDoubleClick={() => {
        if (!isJoined) onJoin(work.work_id);
      }}
    >
      <div className={styles.workCardMain}>
        <div className={styles.workCardInfo}>
          <div className={styles.workCardTitleRow}>
            {drawingName && (
              <span className={styles.workCardTitle}>{drawingName}</span>
            )}
            {isLocal && (
              <span className={styles.workCardLocalTag}>{t('本地')}</span>
            )}
          </div>
          <div className={styles.workCardMetaRow}>
            {isLocal ? (
              <span className={styles.workCardMeta}>
                {t('协同ID')}: {work.work_id}
              </span>
            ) : (
              <>
                {projectName && (
                  <span className={styles.workCardMeta}>{projectName}</span>
                )}
                {creator.name && (
                  <span className={styles.workCardMeta}>{creator.name}</span>
                )}
              </>
            )}
          </div>
        </div>
        <span className={styles.workCardBadge}>
          {onlineCount}
          {t('在线')}
        </span>
      </div>

      <div className={styles.workCardFooter}>
        <div className={styles.workCardAvatars}>
          {participants.length === 0 && (
            <span className={styles.workCardNoUsers}>{t('暂无参与者')}</span>
          )}
          {participants.map((ud, i) => {
            let name = `${t('用户')}${i + 1}`;
            let avatar: string | undefined;
            try {
              const parsed = JSON.parse(atob(ud));
              name = parsed.name ?? name;
              avatar = parsed.avatar;
            } catch {
              // 解析失败时忽略，使用默认值
            }
            return (
              <div key={i} className={styles.avatar} title={name}>
                <UserAvatar
                  avatar={avatar}
                  name={name}
                  size={22}
                  className="w-full h-full"
                />
              </div>
            );
          })}
          {deduped.linkUserData.length > 8 && (
            <div className={`${styles.avatar} ${styles.avatarMore}`}>
              +{deduped.linkUserData.length - 8}
            </div>
          )}
        </div>
        <div className={styles.workCardActions}>
          <Button
            variant="outline"
            size="xs"
            icon={Share2}
            onClick={() => setShowShare(true)}
          >
            {t('分享')}
          </Button>
          {isJoined ? (
            <Button variant="danger" size="xs" icon={LogOut} onClick={onExit}>
              {t('退出')}
            </Button>
          ) : (
            <Button
              data-tour="join-collaborate-btn"
              variant="primary"
              size="xs"
              icon={UserPlus}
              loading={isJoining}
              onClick={() => onJoin(work.work_id)}
            >
              {t('加入')}
            </Button>
          )}
        </div>
      </div>

      {showShare && (
        <CollabShareModal
          isOpen={true}
          onClose={() => setShowShare(false)}
          workId={work.work_id}
          drawingId={data?.drawingId}
          projectId={data?.projectId}
          libraryKey={libraryKey}
        />
      )}
    </div>
  );
};

export default CollabWorkCard;
