import React from 'react';
import { NavigateFunction } from 'react-router-dom';
import { Shield, Crown } from 'lucide-react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useMembership } from '@/hooks/useMembership';
import { MEMBERSHIP_ENABLED } from '@/constants/appConfig';
import styles from './Profile.module.css';

interface ProfileUser {
  avatar?: string | null;
  nickname?: string | null;
  username?: string | null;
}

interface ProfileHeaderProps {
  user: ProfileUser | null;
  isAdmin: boolean;
  membership: ReturnType<typeof useMembership>;
  avatarUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNavigate: NavigateFunction;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user,
  isAdmin,
  membership,
  avatarUploading,
  fileInputRef,
  onAvatarChange,
  onNavigate,
}) => {
  return (
    <>
      <div className={styles.profileHeader}>
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper}>
            <div className={styles.avatarGlow} />
            <div
              className="relative cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUploading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/40">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <UserAvatar
                avatar={user?.avatar || undefined}
                name={user?.nickname || user?.username || ''}
                size={80}
                className={styles.avatarImage}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/30 transition-colors">
                <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('更换')}
                </span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={onAvatarChange}
            />
          </div>
          <div className={styles.userInfo}>
            <h1 className={styles.userName}>
              {user?.nickname || user?.username || t('用户')}
            </h1>
            <p className={styles.userRole}>
              <Shield size={14} />
              {isAdmin ? t('系统管理员') : t('普通用户')}
            </p>
          </div>
        </div>
      </div>

      {MEMBERSHIP_ENABLED && (
        <div
          className="ml-6 mr-6 mt-6 p-4 rounded-xl flex items-center justify-between"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary-400), var(--accent-400))',
              }}
            >
              <Crown size={20} style={{ color: 'var(--text-inverse)' }} />
            </div>
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {membership?.isVip
                  ? t('VIP{level}', { level: String(membership.tierLevel) })
                  : t('免费用户')}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {membership?.isVip
                  ? (() => {
                      const d = membership.daysRemaining;
                      const m = Math.floor(d / 30);
                      const days = d % 30;
                      let remain = '';
                      if (m > 0 && days > 0)
                        remain = t('剩余 {months} 个月 {days} 天', {
                          months: String(m),
                          days: String(days),
                        });
                      else if (m > 0)
                        remain = t('剩余 {months} 个月', { months: String(m) });
                      else remain = t('剩余 {days} 天', { days: String(d) });
                      return t('有效期至 {date} · {remain}', {
                        date: membership.expiresAt
                          ? new Date(membership.expiresAt).toLocaleDateString(
                              'zh-CN'
                            )
                          : '',
                        remain,
                      });
                    })()
                  : t('开通会员享受更多权益')}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('/member-center')}
          >
            {t('会员中心')}
          </Button>
        </div>
      )}
    </>
  );
};
