import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Edit from 'lucide-react/dist/esm/icons/edit';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import UserIcon from 'lucide-react/dist/esm/icons/user';
import Search from 'lucide-react/dist/esm/icons/search';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import UserPlus from 'lucide-react/dist/esm/icons/user-plus';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Users from 'lucide-react/dist/esm/icons/users';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { TruncateText } from '../components/ui/TruncateText';
import { usersApi } from '../services/usersApi';
import { rolesApi } from '../services/rolesApi';
import { runtimeConfigApi } from '../services/runtimeConfigApi';
import { UpdateUserDto, UserResponseDto } from '../types/api-client';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission, getRoleDisplayName } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';

type RoleDto = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * 用户管理页面 - CloudCAD
 * 
 * 设计特色：
 * - 使用 CSS 变量适配深色/亮色主题
 * - 精美的卡片式布局
 * - 流畅的动画效果
 * - 专业的数据表格
 */
export const UserManagement = () => {
  useDocumentTitle('用户管理');
  const { isDark } = useTheme();
  const { hasPermission } = usePermission();
  const [canAccess, setCanAccess] = useState(false);
  const [users, setUsers] = useState<UserResponseDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 搜索、筛选、排序、分页状态
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalUsers, setTotalUsers] = useState(0);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponseDto | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    roleId: '',
    nickname: '',
  });

  // 删除确认模态框状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  // 运行时配置
  const [mailEnabled, setMailEnabled] = useState(false);

  // 表单验证错误
  const [formErrors, setFormErrors] = useState({
    username: '',
    email: '',
    password: '',
  });

  // 成功提示
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) {
      await Promise.all([loadData(), loadRoles(), loadRuntimeConfig()]);
    }
  };

  const loadRuntimeConfig = async () => {
    try {
      const response = await runtimeConfigApi.getPublicConfigs();
      // 响应直接包含配置数据
      const data = response.data as Record<string, string | number | boolean> | undefined;
      setMailEnabled(data?.mailEnabled === true);
    } catch (error) {
      console.error('加载运行时配置失败:', error);
      setMailEnabled(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await rolesApi.list();
      setRoles(response.data);
    } catch (error) {
      console.error('加载角色列表失败:', error);
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    try {
      const hasAccess =
        hasPermission(SystemPermission.SYSTEM_USER_READ) ||
        hasPermission(SystemPermission.SYSTEM_USER_CREATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_UPDATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_DELETE);

      setCanAccess(hasAccess);
      return hasAccess;
    } catch (error) {
      setCanAccess(false);
      return false;
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersApi.list({
        search: searchQuery || undefined,
        roleId: roleFilter || undefined,
        page: currentPage,
        limit: pageSize,
        sortBy,
        sortOrder,
      });
      setUsers(response.data?.users || []);
      setTotalUsers(response.data?.total || 0);
    } catch (error) {
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 当搜索、筛选、排序或分页改变时重新加载数据
  useEffect(() => {
    if (canAccess) {
      loadData();
    }
  }, [searchQuery, roleFilter, sortBy, sortOrder, currentPage, canAccess]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    const defaultRole = roles.find((r) => r.name === 'USER');
    setFormData({
      username: '',
      email: '',
      password: '',
      roleId: defaultRole?.id || '',
      nickname: '',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserResponseDto) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      roleId: user.role?.id || '',
      nickname: user.nickname || '',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  // 表单验证函数
  const validateForm = (): boolean => {
    const errors = {
      username: '',
      email: '',
      password: '',
    };

    if (!formData.username) {
      errors.username = '用户名不能为空';
    } else if (formData.username.length < 3) {
      errors.username = '用户名至少3个字符';
    } else if (formData.username.length > 20) {
      errors.username = '用户名最多20个字符';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      errors.username = '用户名只能包含字母、数字和下划线';
    }

    if (mailEnabled && !formData.email) {
      errors.email = '邮箱不能为空';
    } else if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    if (!editingUser) {
      if (!formData.password) {
        errors.password = '密码不能为空';
      } else if (formData.password.length < 8) {
        errors.password = '密码至少8个字符';
      } else if (formData.password.length > 50) {
        errors.password = '密码最多50个字符';
      }
    } else if (formData.password && formData.password.length < 8) {
      errors.password = '密码至少8个字符';
    }

    setFormErrors(errors);
    return !errors.username && !errors.email && !errors.password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      if (editingUser) {
        const updateData = {
          username: formData.username,
          email: formData.email,
          roleId: formData.roleId,
          nickname: formData.nickname,
        } as UpdateUserDto;
        if (formData.password) {
          updateData.password = formData.password;
        }
        await usersApi.update(editingUser.id, updateData);
        showSuccess('用户更新成功');
      } else {
        const createData = {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          roleId: formData.roleId,
          nickname: formData.nickname,
        };
        await usersApi.create(createData);
        showSuccess('用户创建成功');
      }

      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      setError(editingUser ? '更新用户失败' : '创建用户失败');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDelete = (id: string) => {
    setUserToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    setLoading(true);
    try {
      await usersApi.delete(userToDelete);
      showSuccess('用户删除成功');
      await loadData();
    } catch (error) {
      setError('删除用户失败');
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setUserToDelete(null);
  };

  const getRoleName = (role: string | { name: string }) => {
    if (typeof role === 'string') {
      return roles.find((r) => r.id === role)?.name || '未知角色';
    } else if (role && role.name) {
      return role.name;
    }
    return '未知角色';
  };

  // 权限不足状态
  if (!canAccess) {
    return (
      <div className="user-management-container">
        <div className="access-denied-state">
          <div className="access-denied-icon">
            <AlertCircle size={48} />
          </div>
          <h2 className="access-denied-title">访问被拒绝</h2>
          <p className="access-denied-text">您没有权限访问此页面。</p>
          <p className="access-denied-hint">请联系管理员获取用户管理权限。</p>
        </div>
        <style>{userManagementStyles}</style>
      </div>
    );
  }

  // 有权限但无法查看列表的情况
  if (!hasPermission(SystemPermission.SYSTEM_USER_READ)) {
    return (
      <div className="user-management-container">
        <div className="limited-access-card">
          <div className="limited-access-icon">
            <AlertCircle size={48} />
          </div>
          <h2 className="limited-access-title">无法查看用户列表</h2>
          <p className="limited-access-text">
            您没有查看用户列表的权限，但拥有以下操作权限：
          </p>
          <div className="permission-badges">
            {hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
              <span className="permission-badge create">创建用户</span>
            )}
            {hasPermission(SystemPermission.SYSTEM_USER_UPDATE) && (
              <span className="permission-badge update">更新用户</span>
            )}
            {hasPermission(SystemPermission.SYSTEM_USER_DELETE) && (
              <span className="permission-badge delete">删除用户</span>
            )}
          </div>
          <p className="limited-access-hint">
            请联系管理员授予查看用户列表的权限（SYSTEM_USER_READ）
          </p>
        </div>
        <style>{userManagementStyles}</style>
      </div>
    );
  }

  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <div className="user-management-container">
      {/* 成功提示 */}
      {successMessage && (
        <div className="success-toast">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <XCircle size={18} />
          <span>{error}</span>
          <button onClick={loadData} className="error-retry-btn">
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      )}

      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-title-section">
          <div className="page-title-icon">
            <Users size={24} />
          </div>
          <div>
            <h1 className="page-title">用户管理</h1>
            <p className="page-subtitle">
              管理团队成员、分配角色及存储配额
            </p>
          </div>
        </div>
        {hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
          <Button 
            onClick={handleOpenCreate} 
            disabled={loading}
            className="add-user-btn"
          >
            <UserPlus size={18} />
            添加用户
          </Button>
        )}
      </div>

      {/* 筛选和搜索控件 */}
      <div className="filters-card">
        <div className="filters-grid">
          {/* 搜索框 */}
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="搜索用户（邮箱、用户名、昵称）"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="search-input"
            />
          </div>

          {/* 角色筛选 */}
          <div className="filter-select-wrapper">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="">所有角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleDisplayName(role.name, role.isSystem)}
                </option>
              ))}
            </select>
          </div>

          {/* 排序方式 */}
          <div className="filter-select-wrapper">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                field && setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="createdAt-desc">创建时间（降序）</option>
              <option value="createdAt-asc">创建时间（升序）</option>
              <option value="username-asc">用户名（升序）</option>
              <option value="username-desc">用户名（降序）</option>
              <option value="email-asc">邮箱（升序）</option>
              <option value="email-desc">邮箱（降序）</option>
            </select>
          </div>
        </div>

        {/* 分页信息 */}
        <div className="pagination-info">
          <span className="pagination-text">
            共 <strong>{totalUsers}</strong> 位用户，每页 {pageSize} 条
          </span>
          <div className="pagination-controls">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || loading}
              className="pagination-btn"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="pagination-current">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages || 1, currentPage + 1))}
              disabled={currentPage >= totalPages || loading}
              className="pagination-btn"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 用户列表表格 */}
      <div className="users-table-card">
        {loading && users.length === 0 ? (
          <div className="loading-state">
            <Loader2 size={32} className="animate-spin" />
            <p>加载用户列表...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Users size={48} />
            </div>
            <h3 className="empty-title">暂无用户</h3>
            <p className="empty-text">
              {searchQuery ? '未找到匹配的用户，请尝试其他搜索条件' : '还没有任何用户，点击上方按钮添加第一个用户'}
            </p>
            {!searchQuery && hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
              <Button onClick={handleOpenCreate} className="mt-4">
                <UserPlus size={18} />
                添加用户
              </Button>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th className="col-user">用户</th>
                  <th className="col-role">角色</th>
                  <th className="col-status">状态</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr 
                    key={user.id} 
                    className="user-row"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <td className="cell-user">
                      <div className="user-info">
                        <div className="user-avatar">
                          {user.avatar ? (
                            <img src={user.avatar} alt="" />
                          ) : (
                            <UserIcon size={20} />
                          )}
                        </div>
                        <div className="user-details">
                          <div className="user-name">
                            <TruncateText>
                              {user.nickname || user.username}
                            </TruncateText>
                          </div>
                          <div className="user-email">
                            <TruncateText>{user.email || '未设置邮箱'}</TruncateText>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="cell-role">
                      <span className="role-badge">
                        <Shield size={12} />
                        {getRoleDisplayName(user.role?.name, user.role?.isSystem)}
                      </span>
                    </td>
                    <td className="cell-status">
                      <span className={`status-badge status-${user.status?.toLowerCase() || 'inactive'}`}>
                        {user.status === 'ACTIVE'
                          ? '活跃'
                          : user.status === 'INACTIVE'
                            ? '非活跃'
                            : '已暂停'}
                      </span>
                    </td>
                    <td className="cell-actions">
                      <div className="action-buttons">
                        {hasPermission(SystemPermission.SYSTEM_USER_READ) &&
                          hasPermission(SystemPermission.SYSTEM_USER_UPDATE) && (
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="action-btn edit"
                              title="编辑"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                        {hasPermission(SystemPermission.SYSTEM_USER_READ) &&
                          hasPermission(SystemPermission.SYSTEM_USER_DELETE) && (
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="action-btn delete"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 编辑/创建模态框 */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? '编辑用户' : '添加新用户'}
        size="lg"
        footer={
          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading}
              className="submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  处理中...
                </>
              ) : (
                editingUser ? '保存修改' : '创建用户'
              )}
            </Button>
          </div>
        }
      >
        <form className="user-form">
          <div className="form-row">
            <div className={`form-group ${formErrors.username ? 'has-error' : ''}`}>
              <label className="form-label">
                用户名 <span className="required">*</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value });
                  if (formErrors.username) {
                    setFormErrors({ ...formErrors, username: '' });
                  }
                }}
                className="form-input"
                placeholder="3-20个字符，只能包含字母、数字和下划线"
              />
              {formErrors.username && (
                <span className="error-text">{formErrors.username}</span>
              )}
            </div>

            <div className={`form-group ${formErrors.email ? 'has-error' : ''}`}>
              <label className="form-label">
                邮箱 {mailEnabled && <span className="required">*</span>}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (formErrors.email) {
                    setFormErrors({ ...formErrors, email: '' });
                  }
                }}
                className="form-input"
                placeholder={mailEnabled ? '请输入邮箱地址' : '可选，用于接收通知'}
              />
              {formErrors.email && (
                <span className="error-text">{formErrors.email}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className={`form-group ${formErrors.password ? 'has-error' : ''}`}>
              <label className="form-label">
                {editingUser ? '新密码' : '密码'}
                {!editingUser && <span className="required">*</span>}
                {editingUser && <span className="optional">（留空则不修改）</span>}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (formErrors.password) {
                    setFormErrors({ ...formErrors, password: '' });
                  }
                }}
                className="form-input"
                placeholder={editingUser ? '留空保持原密码' : '至少8个字符'}
              />
              {formErrors.password && (
                <span className="error-text">{formErrors.password}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">
                昵称 <span className="optional">（可选）</span>
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) =>
                  setFormData({ ...formData, nickname: e.target.value })
                }
                className="form-input"
                placeholder="请输入昵称"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              角色 <span className="required">*</span>
            </label>
            <select
              value={formData.roleId}
              onChange={(e) =>
                setFormData({ ...formData, roleId: e.target.value })
              }
              className="form-select"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleDisplayName(role.name, role.isSystem)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title="确认删除用户"
        footer={
          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={cancelDelete}
              disabled={loading}
            >
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={loading}
              className="danger-btn"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </div>
        }
      >
        <div className="delete-confirm-content">
          <div className="delete-warning-box">
            <AlertCircle size={24} />
            <div>
              <p className="delete-warning-title">重要提示</p>
              <p className="delete-warning-text">
                删除用户后，该用户的所有相关数据可能无法恢复。请谨慎操作。
              </p>
            </div>
          </div>
          <p className="delete-confirm-text">
            确定要删除该用户吗？此操作不可恢复。
          </p>
        </div>
      </Modal>

      <style>{userManagementStyles}</style>
    </div>
  );
};

// CSS 样式
const userManagementStyles = `
  /* ===== 容器基础 ===== */
  .user-management-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6);
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== 成功提示 Toast ===== */
  .success-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--success);
    color: white;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    animation: slideInRight 0.3s ease-out;
    z-index: 100;
  }

  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* ===== 错误横幅 ===== */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    margin-bottom: var(--space-6);
    background: var(--error-dim);
    border: 1px solid var(--error);
    border-radius: var(--radius-xl);
    color: var(--error);
  }

  .error-retry-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem;
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .error-retry-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  /* ===== 页面头部 ===== */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }

  .page-title-section {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .page-title-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-xl);
    color: white;
    box-shadow: var(--shadow-md);
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 0.9375rem;
    color: var(--text-tertiary);
    margin: 0.25rem 0 0;
  }

  .add-user-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ===== 筛选卡片 ===== */
  .filters-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    margin-bottom: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  @media (max-width: 768px) {
    .filters-grid {
      grid-template-columns: 1fr;
    }
  }

  /* 搜索输入框 */
  .search-input-wrapper {
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    transition: color 0.2s;
  }

  .search-input-wrapper:focus-within .search-icon {
    color: var(--primary-500);
  }

  .search-input {
    width: 100%;
    padding: var(--space-3) var(--space-4) var(--space-3) 2.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:hover {
    border-color: var(--border-strong);
  }

  .search-input:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  [data-theme="dark"] .search-input:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  /* 筛选下拉框 */
  .filter-select-wrapper {
    position: relative;
  }

  .filter-select {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
  }

  .filter-select:hover {
    border-color: var(--border-strong);
  }

  .filter-select:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  /* 分页信息 */
  .pagination-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }

  .pagination-text {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .pagination-text strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .pagination-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--border-strong);
    color: var(--text-primary);
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-current {
    padding: 0.5rem 1rem;
    background: var(--primary-100);
    color: var(--primary-700);
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    font-weight: 600;
    min-width: 60px;
    text-align: center;
  }

  [data-theme="dark"] .pagination-current {
    background: var(--primary-100);
    color: var(--primary-500);
  }

  /* ===== 用户表格卡片 ===== */
  .users-table-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    min-height: 400px;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .users-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  .users-table th {
    padding: var(--space-4) var(--space-6);
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-default);
  }

  .users-table th.col-user { width: 40%; }
  .users-table th.col-role { width: 20%; }
  .users-table th.col-status { width: 15%; }
  .users-table th.col-actions { width: 25%; text-align: right; }

  .users-table td {
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border-subtle);
    transition: background 0.2s;
  }

  .users-table tbody tr {
    animation: slideInRow 0.3s ease-out forwards;
    opacity: 0;
  }

  @keyframes slideInRow {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .users-table tbody tr:hover td {
    background: var(--bg-tertiary);
  }

  .users-table tbody tr:last-child td {
    border-bottom: none;
  }

  /* 用户信息单元格 */
  .cell-user {
    width: 40%;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .user-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-400), var(--accent-400));
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-details {
    min-width: 0;
    flex: 1;
  }

  .user-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9375rem;
  }

  .user-email {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin-top: 0.125rem;
  }

  /* 角色徽章 */
  .cell-role {
    width: 20%;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* 状态徽章 */
  .cell-status {
    width: 15%;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 0.875rem;
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 600;
    border: 1px solid;
  }

  .status-active {
    background: var(--success-dim);
    color: var(--success);
    border-color: var(--success);
  }

  .status-inactive {
    background: var(--warning-dim);
    color: var(--warning);
    border-color: var(--warning);
  }

  .status-suspended {
    background: var(--error-dim);
    color: var(--error);
    border-color: var(--error);
  }

  /* 操作按钮 */
  .cell-actions {
    width: 25%;
    text-align: right;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    border-radius: var(--radius-lg);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: var(--bg-tertiary);
  }

  .action-btn.edit:hover {
    color: var(--primary-500);
    background: var(--primary-100);
  }

  .action-btn.delete:hover {
    color: var(--error);
    background: var(--error-dim);
  }

  /* ===== 加载状态 ===== */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    color: var(--text-tertiary);
    gap: var(--space-4);
  }

  .loading-state .animate-spin {
    animation: spin 1s linear infinite;
    color: var(--primary-500);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ===== 空状态 ===== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    padding: var(--space-8);
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-2xl);
    color: var(--text-muted);
    margin-bottom: var(--space-4);
  }

  .empty-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2);
  }

  .empty-text {
    font-size: 0.9375rem;
    color: var(--text-tertiary);
    max-width: 400px;
    margin: 0;
  }

  /* ===== 访问被拒绝状态 ===== */
  .access-denied-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    animation: fadeIn 0.4s ease-out;
  }

  .access-denied-icon {
    color: var(--error);
    margin-bottom: var(--space-4);
    opacity: 0.8;
  }

  .access-denied-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-2);
  }

  .access-denied-text {
    font-size: 1rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .access-denied-hint {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin: 0;
  }

  /* ===== 有限访问状态 ===== */
  .limited-access-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    padding: var(--space-8);
    text-align: center;
    animation: fadeIn 0.4s ease-out;
  }

  .limited-access-icon {
    color: var(--warning);
    margin-bottom: var(--space-4);
    opacity: 0.8;
  }

  .limited-access-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-3);
  }

  .limited-access-text {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-4);
    max-width: 400px;
  }

  .permission-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .permission-badge {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-full);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .permission-badge.create {
    background: var(--success-dim);
    color: var(--success);
  }

  .permission-badge.update {
    background: var(--primary-100);
    color: var(--primary-600);
  }

  .permission-badge.delete {
    background: var(--error-dim);
    color: var(--error);
  }

  .limited-access-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0;
  }

  /* ===== 表单样式 ===== */
  .user-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }

  @media (max-width: 640px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-group.has-error .form-input,
  .form-group.has-error .form-select {
    border-color: var(--error);
    background: var(--error-light);
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .required {
    color: var(--error);
  }

  .optional {
    color: var(--text-muted);
    font-weight: 400;
  }

  .form-input,
  .form-select {
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s;
    outline: none;
  }

  .form-input::placeholder {
    color: var(--text-muted);
  }

  .form-input:hover,
  .form-select:hover {
    border-color: var(--border-strong);
  }

  .form-input:focus,
  .form-select:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100);
  }

  [data-theme="dark"] .form-input:focus,
  [data-theme="dark"] .form-select:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }

  .form-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
    cursor: pointer;
  }

  .error-text {
    font-size: 0.8125rem;
    color: var(--error);
  }

  /* ===== 模态框样式 ===== */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .submit-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .danger-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--error) !important;
  }

  .danger-btn:hover {
    background: #dc2626 !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  /* ===== 删除确认样式 ===== */
  .delete-confirm-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .delete-warning-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--warning-light);
    border: 1px solid var(--warning);
    border-radius: var(--radius-lg);
    color: var(--warning);
  }

  .delete-warning-title {
    font-weight: 600;
    margin: 0 0 var(--space-1);
    color: var(--warning);
  }

  .delete-warning-text {
    font-size: 0.875rem;
    margin: 0;
    color: var(--warning);
    opacity: 0.9;
  }

  .delete-confirm-text {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    margin: 0;
  }
`;

export default UserManagement;