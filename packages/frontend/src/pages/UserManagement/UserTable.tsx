import { User } from 'lucide-react';
import { TruncateText } from '@/components/ui/TruncateText';

interface UserTableProps {
  users: Array<{
    id: string;
    username: string;
    nickname?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    status?: string;
    role?: { name: string; isSystem?: boolean };
  }>;
  mailEnabled: boolean;
  smsEnabled: boolean;
  onEdit: (user: any) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onOpenQuota: (user: any) => void;
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
                      <img src={user.avatar} alt="" />
                    ) : (
                      <User size={20} />
                    )}
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
                <span className="role-badge">
                  {user.role?.name || '未知角色'}
                </span>
              </td>
              <td className="cell-quota">
                <button
                  onClick={() => onOpenQuota(user)}
                  className="quota-btn"
                  title="配置存储配额"
                >
                  配额
                </button>
              </td>
              <td className="cell-status">
                <span className={`status-badge status-${(user.status || 'ACTIVE').toLowerCase()}`}>
                  {user.status === 'ACTIVE'
                    ? '正常'
                    : user.status === 'INACTIVE'
                      ? '未激活'
                      : '已禁用'}
                </span>
              </td>
              <td className="cell-actions">
                <div className="action-buttons">
                  <button
                    onClick={() => onEdit(user)}
                    className="action-btn edit"
                    title="编辑用户"
                  >
                    编辑
                  </button>
                  {userTab === 'deleted' ? (
                    <button
                      onClick={() => onRestore(user.id)}
                      className="action-btn restore"
                      title="恢复用户"
                    >
                      恢复
                    </button>
                  ) : (
                    <button
                      onClick={() => onDelete(user.id)}
                      className="action-btn delete"
                      title="注销"
                    >
                      注销
                    </button>
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
