import { User } from 'lucide-react';
import { t } from '@/languages';
import { TruncateText } from '@/components/ui/TruncateText';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { getRoleDisplayName } from '@/constants/permissions';

export interface UserTableUser {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  status?: string;
  deletedAt?: string | null;
  role?: { id?: string; name: string; isSystem?: boolean };
}

interface UserTableProps {
  users: Array<UserTableUser>;
  mailEnabled: boolean;
  smsEnabled: boolean;
  onEdit: (user: UserTableUser) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onOpenQuota: (user: UserTableUser) => void;
  userTab: 'active' | 'deleted';
  loading: boolean;
}

export function UserTable({
  users,
  mailEnabled,
  smsEnabled,
  onEdit,
  onDelete,
  onRestore,
  onOpenQuota,
  userTab,
  loading,
}: UserTableProps) {
  if (loading && users.length === 0) {
    return <div className="loading-state">{t("加载中...")}</div>;
  }

  if (users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <User size={48} />
        </div>
        <h3 className="empty-title">
          {userTab === 'deleted' ? t('暂无已注销用户') : t('暂无用户')}
        </h3>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="users-table">
        <thead>
          <tr>
            <th className="col-user">{t("用户")}</th>
            {mailEnabled && <th className="col-email">{t("邮箱")}</th>}
            {smsEnabled && <th className="col-phone">{t("手机号")}</th>}
            <th className="col-role">{t("角色")}</th>
            <th className="col-quota">{t("存储配额")}</th>
            <th className="col-status">{t("状态")}</th>
            <th className="col-actions">{t("操作")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="user-row">
              <td className="cell-user">
                <div className="user-info">
                  <div className="user-avatar">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt=""
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : null}
                    {!user.avatar || <User size={20} />}
                  </div>
                  <div className="user-details">
                    <div className="user-name">
                      <TruncateText>
                        {user.nickname || user.username}
                      </TruncateText>
                    </div>
                    <div className="user-username">
                      <TruncateText>{user.username}</TruncateText>
                    </div>
                  </div>
                </div>
              </td>
              {mailEnabled && (
                <td className="cell-email">
                  {user.email || <span className="text-muted">{t("未绑定")}</span>}
                </td>
              )}
              {smsEnabled && (
                <td className="cell-phone">
                  {user.phone || <span className="text-muted">{t("未绑定")}</span>}
                </td>
              )}
              <td className="cell-role">
                <Tag variant="primary">
                  {getRoleDisplayName(user.role?.name ?? '', user.role?.isSystem ?? false) || t('未知角色')}
                </Tag>
              </td>
              <td className="cell-quota">
                <Button
                  onClick={() => onOpenQuota(user)}
                  className="quota-btn"
                  title={t("配置存储配额")}
                  variant="secondary"
                  size="sm"
                >
                  {t("配额")}
                </Button>
              </td>
              <td className="cell-status">
                {user.deletedAt ? (
                  <Tag variant="error">{t("已注销")}</Tag>
                ) : (
                  <Tag variant={user.status === 'ACTIVE' ? 'success' : user.status === 'INACTIVE' ? 'warning' : 'error'}>
                    {user.status === 'ACTIVE'
                      ? t('正常')
                      : user.status === 'INACTIVE'
                        ? t('未激活')
                        : t('已禁用')}
                  </Tag>
                )}
              </td>
              <td className="cell-actions">
                <div className="action-buttons">
                  <Button
                    onClick={() => onEdit(user)}
                    className="action-btn edit"
                    title={t("编辑用户")}
                    variant="secondary"
                    size="sm"
                  >
                    {t("编辑")}
                  </Button>
                  {userTab === 'deleted' ? (
                    <Button
                      onClick={() => onRestore(user.id)}
                    className="action-btn restore"
                    title={t("恢复用户")}
                      variant="secondary"
                      size="sm"
                    >
                      {t("恢复")}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onDelete(user.id)}
                    className="action-btn delete"
                    title={t("注销")}
                      variant="secondary"
                      size="sm"
                    >
                      {t("注销")}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
