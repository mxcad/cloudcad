import React, { useEffect, useState } from 'react';
import {
  User,
  Mail,
  Phone,
  MessageCircle,
  Shield,
  Activity,
  Calendar,
  CheckCircle,
  XCircle,
  Save,
  X,
  ChevronRight,
  Key,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { usePermission } from '../../hooks/usePermission';
import { useProfileUpdate } from './hooks/useProfileUpdate';
import { Input } from '@/components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { t } from '@/languages';
import styles from './Profile.module.css';

const ICON_CLASS_MAP: Record<string, string | undefined> = {
  primary: styles.infoIconWrapperPrimary,
  accent: styles.infoIconWrapperAccent,
  info: styles.infoIconWrapperInfo,
  success: styles.infoIconWrapperSuccess,
  purple: styles.infoIconWrapperPurple,
  warning: styles.infoIconWrapperWarning,
};

interface ProfileInfoTabProps {
  user: {
    username?: string;
    email?: string | { [key: string]: unknown } | null;
    phone?: string | { [key: string]: unknown } | null;
    phoneVerified?: boolean;
    nickname?: string;
    status?: string;
    avatar?: string;
    hasPassword?: boolean;
    wechatId?: string | { [key: string]: unknown } | null;
    createdAt?: string;
  } | null;
  onNavigateTab?: (tab: 'password' | 'email' | 'phone' | 'wechat') => void;
  mailEnabled?: boolean;
  smsEnabled?: boolean;
  wechatEnabled?: boolean;
}

interface InfoCardProps {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const InfoCard: React.FC<InfoCardProps> = ({
  icon,
  iconClass,
  label,
  onClick,
  children,
}) => (
  <div
    className={`${styles.infoCard} ${onClick ? styles.infoCardClickable : ''}`}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
  >
    <div
      className={`${styles.infoIconWrapper} ${ICON_CLASS_MAP[iconClass] ?? ''}`}
    >
      {icon}
    </div>
    <div className={styles.infoContent}>
      <label>{label}</label>
      {children}
    </div>
    {onClick && <ChevronRight size={16} className={styles.cardChevron} />}
  </div>
);

export const ProfileInfoTab: React.FC<ProfileInfoTabProps> = ({
  user,
  onNavigateTab,
  mailEnabled = false,
  smsEnabled = false,
  wechatEnabled = false,
}) => {
  const { isAdmin } = usePermission();
  const { refreshUser } = useAuth();
  const { updateProfile, loading } = useProfileUpdate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    nickname: user?.nickname || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        username: user?.username || '',
        nickname: user?.nickname || '',
      });
    }
  }, [user, isEditing]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await updateProfile({
        username: formData.username,
        nickname: formData.nickname,
      });
      setSuccess(t('个人信息更新成功'));
      await refreshUser();
      setIsEditing(false);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('更新失败')
      );
    }
  };

  return (
    <div className={`${styles.tabContent} animate-fade-in`}>
      {success && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <CheckCircle size={18} className={styles.alertIcon} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <XCircle size={18} className={styles.alertIcon} />
          <span>{error}</span>
        </div>
      )}

      {!isEditing ? (
        <>
          <h2 className={`text-xl font-semibold mb-4 ${styles.textTextPrimary}`}>
            {t('个人信息')}
          </h2>

          <div className={styles.infoGrid}>
            <InfoCard
              icon={<User size={20} />}
              iconClass="primary"
              label={t('用户名')}
              onClick={() => setIsEditing(true)}
            >
              <span>{user?.username || '-'}</span>
            </InfoCard>

            <InfoCard
              icon={<User size={20} />}
              iconClass="accent"
              label={t('昵称')}
              onClick={() => setIsEditing(true)}
            >
              <span>{user?.nickname || '-'}</span>
            </InfoCard>

            <InfoCard
              icon={<Mail size={20} />}
              iconClass="info"
              label={t('邮箱地址')}
              onClick={mailEnabled ? () => onNavigateTab?.('email') : undefined}
            >
              <span className={styles.withStatus}>
                {typeof user?.email === 'string' ? user.email : t('未绑定')}
                {typeof user?.email === 'string' && (
                  <CheckCircle
                    size={14}
                    className={`${styles.statusIcon} ${styles.statusIconSuccess}`}
                  />
                )}
              </span>
            </InfoCard>

            <InfoCard
              icon={<Phone size={20} />}
              iconClass="success"
              label={t('手机号')}
              onClick={smsEnabled ? () => onNavigateTab?.('phone') : undefined}
            >
              <span className={styles.withStatus}>
                {typeof user?.phone === 'string' ? user.phone : t('未绑定')}
                {typeof user?.phone === 'string' && user?.phoneVerified && (
                  <CheckCircle
                    size={14}
                    className={`${styles.statusIcon} ${styles.statusIconSuccess}`}
                  />
                )}
              </span>
            </InfoCard>

            <InfoCard
              icon={<MessageCircle size={20} />}
              iconClass="purple"
              label={t('微信')}
              onClick={
                wechatEnabled ? () => onNavigateTab?.('wechat') : undefined
              }
            >
              <span className={styles.withStatus}>
                {user?.wechatId ? t('已绑定') : t('未绑定')}
                {user?.wechatId ? (
                  <CheckCircle
                    size={14}
                    className={`${styles.statusIcon} ${styles.statusIconSuccess}`}
                  />
                ) : (
                  <XCircle
                    size={14}
                    className={`${styles.statusIcon} ${styles.statusIconMuted}`}
                  />
                )}
              </span>
            </InfoCard>

            <InfoCard
              icon={<Key size={20} />}
              iconClass="warning"
              label={
                user?.hasPassword === false ? t('设置密码') : t('修改密码')
              }
              onClick={() => onNavigateTab?.('password')}
            >
              <span>••••••••</span>
            </InfoCard>

            <InfoCard
              icon={<Shield size={20} />}
              iconClass="success"
              label={t('账户角色')}
            >
              <Tag variant="primary">
                {isAdmin() ? t('系统管理员') : t('普通用户')}
              </Tag>
            </InfoCard>

            <InfoCard
              icon={<Activity size={20} />}
              iconClass="warning"
              label={t('账户状态')}
            >
              <Tag
                variant={
                  user?.status === 'ACTIVE'
                    ? 'success'
                    : user?.status === 'INACTIVE'
                      ? 'warning'
                      : 'error'
                }
              >
                {user?.status === 'ACTIVE'
                  ? t('正常')
                  : user?.status === 'INACTIVE'
                    ? t('未激活')
                    : t('已禁用')}
              </Tag>
            </InfoCard>

            {user?.createdAt && (
              <InfoCard
                icon={<Calendar size={20} />}
                iconClass="info"
                label={t('创建时间')}
              >
                <span>{formatDate(user.createdAt)}</span>
              </InfoCard>
            )}
          </div>
        </>
      ) : (
        <div className={styles.editProfileForm}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-xl font-semibold ${styles.textTextPrimary}`}>
              {t('编辑个人信息')}
            </h2>
            <Button
              variant="secondary"
              icon={X}
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  username: user?.username || '',
                  nickname: user?.nickname || '',
                });
                setError(null);
                setSuccess(null);
              }}
            >
              <span>{t('取消')}</span>
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>{t('用户名')}</label>
              <div className={styles.inputWrapper}>
                <Input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder={t('请输入用户名')}
                  minLength={3}
                  maxLength={20}
                  required
                />
              </div>
              <p className={`text-sm mt-1 ${styles.textTextMuted}`}>
                {t('用户名一月内最多修改3次')}
              </p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>{t('昵称')}</label>
              <div className={styles.inputWrapper}>
                <Input
                  type="text"
                  name="nickname"
                  value={formData.nickname}
                  onChange={handleInputChange}
                  placeholder={t('请输入昵称')}
                  maxLength={50}
                />
              </div>
            </div>

            <div className={styles.buttonGroup}>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={Save}
              >
                {loading ? (
                  <span>{t('保存中...')}</span>
                ) : (
                  <span>{t('保存')}</span>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
