import { t } from '@/languages';
import { TruncateText } from '@/components/ui/TruncateText';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { getRoleDisplayName } from '@/constants/permissions';
import { SelectableTable } from '@/components/common/SelectableTable';
import { Crown, User } from 'lucide-react';
import styles from './UserManagement.module.css';

export interface UserTableUser {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  status?: string;
  deletedAt?: string | null;
  updatedAt?: string;
  role?: { id?: string; name: string; isSystem?: boolean };
  membershipTierLevel?: number;
  membershipExpiresAt?: string | null;
}

interface UserTableProps {
  users: Array<UserTableUser>;
  mailEnabled: boolean;
  smsEnabled: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageMembership: boolean;
  /** 选中 id 集合（受控，页面 useFileBrowserSelection 持有，ADR-0052） */
  selectedIds: Set<string>;
  onToggleSelect: (id: string, ctrlKey?: boolean, shiftKey?: boolean) => void;
  onToggleSelectAll: () => void;
  onRubberBandSelect?: (ids: string[]) => void;
  paginationMeta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  /** 显示"每页条数"选择框（需同时提供 onPageSizeChange） */
  showSizeChanger?: boolean;
  /** 每页条数变化回调 */
  onPageSizeChange?: (pageSize: number) => void;
  /** 每页条数可选值 */
  pageSizeOptions?: number[];
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条） */
  loadError?: string | null;
  /** 失败条重试回调 */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  onEdit: (user: UserTableUser) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onManageMembership: (user: UserTableUser) => void;
  userTab: 'active' | 'deleted';
  loading: boolean;
  /** 底部悬浮操作栏（透传给 SelectableTable，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
}

function getMembershipTag(tierLevel?: number, expiresAt?: string | null) {
  if (!tierLevel) {
    return <Tag variant="neutral">{t('免费用户')}</Tag>;
  }
  const tierLabel = `VIP${tierLevel}`;
  if (expiresAt) {
    const days = Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / 86400000
    );
    if (days <= 0) {
      return <Tag variant="warning">{t('已过期')}</Tag>;
    }
    return (
      <span title={t('到期: {date}', { date: expiresAt })}>
        <Tag variant="primary">
          {t('{tier} ({days}天)', { tier: tierLabel, days: String(days) })}
        </Tag>
      </span>
    );
  }
  return <Tag variant="primary">{tierLabel}</Tag>;
}

export function UserTable({
  users,
  mailEnabled,
  smsEnabled,
  canEdit,
  canDelete,
  canManageMembership,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRubberBandSelect,
  paginationMeta,
  onPageChange,
  showSizeChanger,
  onPageSizeChange,
  pageSizeOptions,
  onScrollPageChange,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  onEdit,
  onDelete,
  onRestore,
  onManageMembership,
  userTab,
  loading,
  bottomBar,
}: UserTableProps) {
  return (
    <SelectableTable<UserTableUser>
      rows={users}
      selectedIds={selectedIds}
      loading={loading}
      bottomBar={bottomBar}
      loadingView={<div className={styles.loadingState}>{t('加载中...')}</div>}
      emptyView={
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <User size={48} />
          </div>
          <h3 className={styles.emptyTitle}>
            {userTab === 'deleted' ? t('暂无已注销用户') : t('暂无用户')}
          </h3>
        </div>
      }
      tableClassName={styles.usersTable}
      rowClassName={() => styles.userRow}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      onRubberBandSelect={onRubberBandSelect}
      paginationMeta={paginationMeta}
      onPageChange={onPageChange}
      showSizeChanger={showSizeChanger}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={pageSizeOptions}
      onScrollPageChange={onScrollPageChange}
      loadError={loadError}
      onRetryLoadMore={onRetryLoadMore}
      minLoadedPage={minLoadedPage}
      renderHeader={() => (
        <>
          <th className={styles.cellUser}>{t('用户')}</th>
          {mailEnabled && <th className={styles.colEmail}>{t('邮箱')}</th>}
          {smsEnabled && <th className={styles.colPhone}>{t('手机号')}</th>}
          <th>{t('角色')}</th>
          <th className={styles.colVip}>{t('会员')}</th>
          <th>{t('状态')}</th>
          <th className={styles.colActions}>{t('操作')}</th>
        </>
      )}
      renderRow={(user) => (
        <>
          <td className={styles.cellUser}>
            <div className={styles.userInfo}>
              <UserAvatar
                avatar={user.avatar}
                name={user.nickname || user.username}
                size={40}
              />
              <div className={styles.userDetails}>
                <div className={styles.userName}>
                  <TruncateText>
                    {user.nickname || user.username}
                  </TruncateText>
                </div>
                <div className={styles.userUsername}>
                  <TruncateText>{user.username}</TruncateText>
                </div>
              </div>
            </div>
          </td>
          {mailEnabled && (
            <td className={styles.cellEmail}>
              {user.email || (
                <span className={styles.textMuted}>{t('未绑定')}</span>
              )}
            </td>
          )}
          {smsEnabled && (
            <td className={styles.cellPhone}>
              {user.phone || (
                <span className={styles.textMuted}>{t('未绑定')}</span>
              )}
            </td>
          )}
          <td>
            <Tag variant="primary">
              {getRoleDisplayName(
                user.role?.name ?? '',
                user.role?.isSystem ?? false
              ) || t('未知角色')}
            </Tag>
          </td>
          <td className={styles.cellVip}>
            {getMembershipTag(
              user.membershipTierLevel,
              user.membershipExpiresAt
            )}
          </td>
          <td>
            {user.deletedAt ? (
              <Tag variant="error">{t('已注销')}</Tag>
            ) : (
              <Tag
                variant={
                  user.status === 'ACTIVE'
                    ? 'success'
                    : user.status === 'INACTIVE'
                      ? 'warning'
                      : 'error'
                }
              >
                {user.status === 'ACTIVE'
                  ? t('正常')
                  : user.status === 'INACTIVE'
                    ? t('未激活')
                    : t('已禁用')}
              </Tag>
            )}
          </td>
          <td className={styles.colActions}>
            <div className={styles.actionButtons}>
              {canManageMembership && !user.deletedAt && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageMembership(user);
                  }}
                  className={`${styles.actionBtn} ${styles.membership}`}
                  title={t('管理会员')}
                  variant="secondary"
                  size="sm"
                >
                  <Crown size={14} />
                  {t('会员')}
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(user);
                  }}
                  className={`${styles.actionBtn} ${styles.edit}`}
                  title={t('编辑用户')}
                  variant="secondary"
                  size="sm"
                >
                  {t('编辑')}
                </Button>
              )}
              {userTab === 'deleted'
                ? canDelete && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(user.id);
                      }}
                      className={`${styles.actionBtn} ${styles.restore}`}
                      title={t('恢复用户')}
                      variant="secondary"
                      size="sm"
                    >
                      {t('恢复')}
                    </Button>
                  )
                : canDelete && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(user.id);
                      }}
                      className={`${styles.actionBtn} ${styles.delete}`}
                      title={t('注销')}
                      variant="secondary"
                      size="sm"
                    >
                      {t('注销')}
                    </Button>
                  )}
            </div>
          </td>
        </>
      )}
    />
  );
}
