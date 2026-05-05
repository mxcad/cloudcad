import { AlertCircle } from 'lucide-react';
import { Shield } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { User } from 'lucide-react';
import { Search } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { UserPlus } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { XCircle } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Users } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { RotateCcw } from 'lucide-react';
import { HardDrive, Save } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TruncateText } from '@/components/ui/TruncateText';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission, getRoleDisplayName } from '@/constants/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/contexts/ThemeContext';
import type { UserResponseDto, UpdateUserDto } from '@/api-sdk';
import { useUserCRUD } from './hooks/useUserCRUD';
import { useUserSearch } from './hooks/useUserSearch';
import { UserTable } from './UserTable';

type RoleDto = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export const UserManagement = () => {
  useDocumentTitle('用户管理');
  const { isDark } = useTheme();
  const { hasPermission } = usePermission();
  const [canAccess, setCanAccess] = useState(false);

  const {
    users,
    loading,
    error,
    roles,
    mailEnabled,
    smsEnabled,
    createUser,
    updateUser,
    deleteUser,
    restoreUser,
    loadUsers,
  } = useUserCRUD();

  const {
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    currentPage,
    setCurrentPage,
    pageSize,
    totalUsers,
    userTab,
    setUserTab,
  } = useUserSearch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponseDto | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
    nickname: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  });
  const [formErrors, setFormErrors] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleteImmediately, setDeleteImmediately] = useState(false);

  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaUser, setQuotaUser] = useState<UserResponseDto | null>(null);
  const [userQuota, setUserQuota] = useState<number>(10);
  const [defaultQuota, setDefaultQuota] = useState<number>(10);

  const [cleanupStats, setCleanupStats] = useState<{
    pendingCleanup: number;
    expiryDate: string;
    delayDays: number;
  } | null>(null);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    const hasAccess = await checkAccess();
    if (hasAccess) {
      await loadUsers();
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    try {
      const hasAccessVal =
        hasPermission(SystemPermission.SYSTEM_USER_READ) ||
        hasPermission(SystemPermission.SYSTEM_USER_CREATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_UPDATE) ||
        hasPermission(SystemPermission.SYSTEM_USER_DELETE);
      setCanAccess(hasAccessVal);
      return hasAccessVal;
    } catch (error) {
      setCanAccess(false);
      return false;
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    const defaultRole = roles.find((r: RoleDto) => r.name === 'USER');
    setFormData({
      username: '',
      email: '',
      phone: '',
      password: '',
      roleId: defaultRole?.id || '',
      nickname: '',
      status: 'ACTIVE',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserResponseDto) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      roleId: user.role?.id || '',
      nickname: user.nickname || '',
      status: user.status || 'ACTIVE',
    });
    setFormErrors({ username: '', email: '', password: '' });
    setIsModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors = { username: '', email: '', password: '' };
    if (!formData.username) {
      errors.username = '用户名不能为空';
    } else if (formData.username.length < 3) {
      errors.username = '用户名至少3个字符';
    } else if (formData.username.length > 20) {
      errors.username = '用户名最多20个字符';
    }
    if (mailEnabled && !formData.email) {
      errors.email = '邮箱不能为空';
    }
    if (!editingUser && !formData.password) {
      errors.password = '密码不能为空';
    }
    setFormErrors(errors);
    return !errors.username && !errors.email && !errors.password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      if (editingUser) {
        const updateData = {
          username: formData.username,
          email: formData.email,
          roleId: formData.roleId,
          nickname: formData.nickname,
          status: formData.status,
        } as UpdateUserDto;
        if (formData.password) {
          (updateData as any).password = formData.password;
        }
        await updateUser(editingUser.id, updateData);
        showSuccess('用户更新成功');
      } else {
        await createUser({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          roleId: formData.roleId,
          nickname: formData.nickname,
        });
        showSuccess('用户创建成功');
      }
      setIsModalOpen(false);
      await loadUsers();
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleDelete = (id: string) => {
    setUserToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete, deleteImmediately);
      showSuccess(deleteImmediately ? '用户立即注销成功' : '用户删除成功');
      await loadUsers();
    } catch (err) {
      // Error handled by hook
    } finally {
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      setDeleteImmediately(false);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setUserToDelete(null);
    setDeleteImmediately(false);
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreUser(id);
      showSuccess('用户已恢复');
      await loadUsers();
    } catch (err) {
      // Error handled by hook
    }
  };

  const totalPages = Math.ceil(totalUsers / pageSize);

  if (!canAccess) {
    return (
      <div className="user-management-container">
        <div className="access-denied-state">
          <div className="access-denied-icon">
            <AlertCircle size={48} />
          </div>
          <h2 className="access-denied-title">访问被拒绝</h2>
          <p className="access-denied-text">您没有权限访问此页面。</p>
        </div>
      </div>
    );
  }

  if (!hasPermission(SystemPermission.SYSTEM_USER_READ)) {
    return (
      <div className="user-management-container">
        <div className="limited-access-card">
          <div className="limited-access-icon">
            <AlertCircle size={48} />
          </div>
          <h2 className="limited-access-title">无法查看用户列表</h2>
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
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-container">
      {successMessage && (
        <div className="success-toast">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <XCircle size={18} />
          <span>{error}</span>
          <button onClick={loadUsers} className="error-retry-btn">
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      )}

      <div className="page-header">
        <div className="page-title-section">
          <div className="page-title-icon">
            <Users size={24} />
          </div>
          <div>
            <h1 className="page-title">用户管理</h1>
            <p className="page-subtitle">管理团队成员、分配角色及存储配额</p>
          </div>
        </div>
        {hasPermission(SystemPermission.SYSTEM_USER_CREATE) && (
          <Button onClick={handleOpenCreate} disabled={loading} className="add-user-btn">
            <UserPlus size={18} />
            添加用户
          </Button>
        )}
        {hasPermission(SystemPermission.SYSTEM_USER_DELETE) && (
          <Button
            onClick={() => setCleanupModalOpen(true)}
            disabled={loading}
            variant="outline"
            className="cleanup-btn"
          >
            <Sparkles size={18} />
            清理已注销用户
          </Button>
        )}
      </div>

      {hasPermission(SystemPermission.SYSTEM_USER_READ) && (
        <div className="user-tabs">
          <button
            className={`user-tab ${userTab === 'active' ? 'active' : ''}`}
            onClick={() => { setUserTab('active'); setCurrentPage(1); }}
          >
            活跃用户
          </button>
          <button
            className={`user-tab ${userTab === 'deleted' ? 'active' : ''}`}
            onClick={() => { setUserTab('deleted'); setCurrentPage(1); }}
          >
            已注销
          </button>
        </div>
      )}

      <div className="filters-card">
        <div className="filters-grid">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="搜索用户（邮箱、用户名、昵称）"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="search-input"
            />
          </div>

          <div className="filter-select-wrapper">
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
              className="filter-select"
            >
              <option value="">所有角色</option>
              {roles.map((role: RoleDto) => (
                <option key={role.id} value={role.id}>
                  {getRoleDisplayName(role.name, role.isSystem)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-select-wrapper">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                if (field) setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option value="createdAt-desc">创建时间（降序）</option>
              <option value="createdAt-asc">创建时间（升序）</option>
              <option value="username-asc">用户名（升序）</option>
              <option value="username-desc">用户名（降序）</option>
            </select>
          </div>
        </div>

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

      <div className="users-table-card">
        <UserTable
          users={users}
          mailEnabled={mailEnabled}
          smsEnabled={smsEnabled}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onOpenQuota={() => {}}
          userTab={userTab}
          loading={loading}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? '编辑用户' : '添加新用户'}
        size="lg"
        footer={
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="submit-btn">
              {loading ? <><Loader2 size={18} className="animate-spin" />处理中...</> : editingUser ? '保存修改' : '创建用户'}
            </Button>
          </div>
        }
      >
        <form className="user-form">
          <div className="form-row">
            <div className={`form-group ${formErrors.username ? 'has-error' : ''}`}>
              <label className="form-label">用户名 <span className="required">*</span></label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="form-input"
              />
              {formErrors.username && <span className="error-text">{formErrors.username}</span>}
            </div>
            <div className={`form-group ${formErrors.email ? 'has-error' : ''}`}>
              <label className="form-label">邮箱 {mailEnabled && <span className="required">*</span>}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="form-input"
              />
              {formErrors.email && <span className="error-text">{formErrors.email}</span>}
            </div>
          </div>
          <div className="form-row">
            <div className={`form-group ${formErrors.password ? 'has-error' : ''}`}>
              <label className="form-label">
                {editingUser ? '新密码' : '密码'}{!editingUser && <span className="required">*</span>}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="form-input"
              />
              {formErrors.password && <span className="error-text">{formErrors.password}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">昵称</label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className="form-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">角色 <span className="required">*</span></label>
            <select
              value={formData.roleId}
              onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
              className="form-select"
            >
              {roles.map((role: RoleDto) => (
                <option key={role.id} value={role.id}>
                  {getRoleDisplayName(role.name, role.isSystem)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title="确认删除用户"
        footer={
          <div className="modal-footer">
            <Button variant="ghost" onClick={cancelDelete} disabled={loading}>取消</Button>
            <Button onClick={confirmDelete} disabled={loading} className="danger-btn">
              {loading ? <><Loader2 size={18} className="animate-spin" />删除中...</> : deleteImmediately ? '立即注销' : '确认删除'}
            </Button>
          </div>
        }
      >
        <div className="delete-confirm-content">
          <div className="delete-warning-box">
            <AlertCircle size={24} />
            <div>
              <p className="delete-warning-title">注销用户</p>
              <p className="delete-warning-text">
                {deleteImmediately ? '立即注销将彻底删除用户数据，无法恢复！' : '用户注销后将进入30天冷静期，冷静期后数据将自动清理。'}
              </p>
            </div>
          </div>
          <p className="delete-confirm-text">确定要注销该用户吗？</p>
          <div className="delete-option">
            <input
              type="checkbox"
              id="delete-immediately"
              checked={deleteImmediately}
              onChange={(e) => setDeleteImmediately(e.target.checked)}
              className="delete-option-checkbox"
            />
            <label htmlFor="delete-immediately" className="delete-option-label">
              立即注销（不等待30天冷静期，直接清理数据）
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        title="配置存储配额"
        size="md"
        footer={
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => setQuotaModalOpen(false)} disabled={quotaLoading}>取消</Button>
            <Button onClick={() => {}} disabled={quotaLoading} className="submit-btn">
              {quotaLoading ? <><Loader2 size={18} className="animate-spin" />保存中...</> : <><Save size={16} className="mr-1" />保存</>}
            </Button>
          </div>
        }
      >
        <div className="quota-config-content">
          <div className="quota-user-info">
            <div className="user-avatar-sm">
              {quotaUser?.avatar ? <img src={quotaUser.avatar} alt="" /> : <User size={20} />}
            </div>
            <div className="user-info-text">
              <p className="user-name">{quotaUser?.nickname || quotaUser?.username || '用户'}</p>
              <p className="user-username">@{quotaUser?.username}</p>
            </div>
          </div>
          <div className="quota-form">
            <label className="quota-label"><HardDrive size={16} /><span>个人空间存储配额</span></label>
            <div className="quota-input-wrapper">
              <input
                type="number"
                value={userQuota}
                onChange={(e) => { const gb = parseInt(e.target.value, 10); if (!isNaN(gb) && gb >= 0) setUserQuota(gb); }}
                className="quota-input"
                min="0"
              />
              <span className="quota-unit">GB</span>
            </div>
            <p className="quota-hint">默认配额：{defaultQuota} GB</p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        title="清理已注销用户数据"
        size="md"
        footer={
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => setCleanupModalOpen(false)} disabled={cleanupLoading}>取消</Button>
            <Button onClick={() => {}} disabled={cleanupLoading} className="submit-btn">
              <Sparkles size={16} className="mr-1" />立即清理
            </Button>
          </div>
        }
      >
        <div className="cleanup-config-content">
          <div className="cleanup-stats">
            <div className="cleanup-stat-item">
              <span className="cleanup-stat-label">待清理用户</span>
              <span className="cleanup-stat-value">{cleanupStats?.pendingCleanup ?? 0}</span>
            </div>
            <div className="cleanup-stat-item">
              <span className="cleanup-stat-label">冷静期</span>
              <span className="cleanup-stat-value">{cleanupStats?.delayDays ?? 30} 天</span>
            </div>
            <div className="cleanup-stat-item">
              <span className="cleanup-stat-label">过期截止</span>
              <span className="cleanup-stat-value">{cleanupStats?.expiryDate ? new Date(cleanupStats.expiryDate).toLocaleDateString('zh-CN') : '-'}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
