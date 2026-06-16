import { User } from 'lucide-react';
import { TruncateText } from '@/components/ui/TruncateText';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

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
    return <div className="loading-state">加载中...</div>;
  }

  if (users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <User size={48} />
        </div>
        <h3 className="empty-title">
          {userTab === 'deleted' ? '暂无已注销用户' : '暂无用户'}
        </h3>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="users-table">
        <thead>
          <tr>
            <th className="col-user">用户</th>
            {mailEnabled && <th className="col-email">邮箱</th>}
            {smsEnabled && <th className="col-phone">手机号</th>}
            <th className="col-role">角色</th>
            <th className="col-quota">存储配额</th>
            <th className="col-status">状态</th>
            <th className="col-actions">操作</th>
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
                  {user.email || <span className="text-muted">未绑定</span>}
                </td>
              )}
              {smsEnabled && (
                <td className="cell-phone">
                  {user.phone || <span className="text-muted">未绑定</span>}
                </td>
              )}
              <td className="cell-role">
                <Tag variant="primary">
                  {user.role?.name || '未知角色'}
                </Tag>
              </td>
              <td className="cell-quota">
                <Button
                  onClick={() => onOpenQuota(user)}
                  className="quota-btn"
                  title="配置存储配额"
                  variant="secondary"
                  size="sm"
                >
                  配额
                </Button>
              </td>
              <td className="cell-status">
                {user.deletedAt ? (
                  <Tag variant="error">已注销</Tag>
                ) : (
                  <Tag variant={user.status === 'ACTIVE' ? 'success' : user.status === 'INACTIVE' ? 'warning' : 'error'}>
                    {user.status === 'ACTIVE'
                      ? '正常'
                      : user.status === 'INACTIVE'
                        ? '未激活'
                        : '已禁用'}
                  </Tag>
                )}
              </td>
              <td className="cell-actions">
                <div className="action-buttons">
                  <Button
                    onClick={() => onEdit(user)}
                    className="action-btn edit"
                    title="编辑用户"
                    variant="secondary"
                    size="sm"
                  >
                    编辑
                  </Button>
                  {userTab === 'deleted' ? (
                    <Button
                      onClick={() => onRestore(user.id)}
                      className="action-btn restore"
                      title="恢复用户"
                      variant="secondary"
                      size="sm"
                    >
                      恢复
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onDelete(user.id)}
                      className="action-btn delete"
                      title="注销"
                      variant="secondary"
                      size="sm"
                    >
                      注销
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
