import { AlertCircle } from 'lucide-react';
import { UserPlus } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { XCircle } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Users } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { usePermission } from '@/hooks/usePermission';
import { SystemPermission } from '@/constants/permissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { CreateUserDto, UserResponseDto, UpdateUserDto } from '@/api-sdk';
import { useUserCRUD } from './hooks/useUserCRUD';
import { useUserSearch } from './hooks/useUserSearch';
import { UserTable, type UserTableUser } from './UserTable';
import { UserSearchBar } from './UserSearchBar';
import { UserQuotaModal } from './UserQuotaModal';
import { CreateUserModal } from './UserModals/CreateUserModal';
import { EditUserModal } from './UserModals/EditUserModal';
import { DeleteUserConfirm } from './UserModals/DeleteUserConfirm';
import { userManagementStyles } from './UserManagementStyles';

export const UserManagement = () => {
  useDocumentTitle('用户管理');
  const { hasPermission } = usePermission();
  const [canAccess, setCanAccess] = useState(false);

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
    userTab,
    setUserTab,
  } = useUserSearch();

  const apiParams = useMemo(() => ({
    search: searchQuery || undefined,
    roleId: roleFilter || undefined,
    status: userTab === 'deleted' ? 'DELETED' : undefined,
    sortBy,
    sortOrder,
    page: currentPage,
    limit: pageSize,
  }), [searchQuery, roleFilter, userTab, sortBy, sortOrder, currentPage, pageSize]);

  const {
    users,
    totalUsers,
    loading,
    error,
    roles,
    mailEnabled,
    smsEnabled,
    cleanupStats,
    createUser,
    updateUser,
    deleteUser,
    restoreUser,
    loadUsers,
    triggerCleanup,
    getStorageQuota,
    updateStorageQuota,
  } = useUserCRUD(apiParams);

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
  const [quotaNodeId, setQuotaNodeId] = useState<string>('');
  const [userQuota, setUserQuota] = useState<number>(10);
  const [defaultQuota, setDefaultQuota] = useState<number>(10);

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

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    const defaultRole = roles.find((r) => r.name === 'USER');
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

  const handleOpenEdit = (user: UserTableUser) => {
      setEditingUser(user as UserResponseDto);
    setFormData({
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      roleId: user.role?.id || '',
      nickname: user.nickname || '',
      status: (user.status as "ACTIVE" | "INACTIVE" | "SUSPENDED") || 'ACTIVE',
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

  const handleSubmit = async (_data: {
    username: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    nickname: string;
    status?: string;
  }) => {
    if (!validateForm()) return;
    try {
      if (editingUser) {
        const updateData: Record<string, unknown> = {
          username: formData.username,
          roleId: formData.roleId,
          status: formData.status,
        };
        // 可选字段：仅当有值时传递
        if (formData.email) updateData.email = formData.email;
        if (formData.nickname) updateData.nickname = formData.nickname;
        if (formData.password) updateData.password = formData.password;
        await updateUser(editingUser.id, updateData as UpdateUserDto);
        showSuccess('用户更新成功');
      } else {
        const createData: Record<string, unknown> = {
          username: formData.username,
          password: formData.password,
          roleId: formData.roleId,
        };
        // 可选字段：仅当有值时传递
        if (formData.email) createData.email = formData.email;
        if (formData.nickname) createData.nickname = formData.nickname;
        if (formData.phone) createData.phone = formData.phone;
        await createUser(createData as CreateUserDto);
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

  const handleOpenQuota = async (user: UserTableUser) => {
    setQuotaUser(user as UserResponseDto);
    setQuotaModalOpen(true);
    try {
      const info = await getStorageQuota(user.id);
      if (info?.total) {
        setUserQuota(Math.round(info.total / (1024 * 1024 * 1024)));
      }
      if (info?.nodeId) {
        setQuotaNodeId(info.nodeId);
      }
    } catch {
      // ignore, use default
    }
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
        <style>{userManagementStyles}</style>
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
        <style>{userManagementStyles}</style>
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
      <style>{userManagementStyles}</style>
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
          <button onClick={loadUsers} disabled={loading} className="error-retry-btn">
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

      <UserSearchBar
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); setCurrentPage(1); }}
        roleFilter={roleFilter}
        onRoleFilterChange={(r) => { setRoleFilter(r); setCurrentPage(1); }}
        roles={roles}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        currentPage={currentPage}
        totalPages={totalPages}
        totalUsers={totalUsers}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setCurrentPage}
      />

      <div className="users-table-card">
        <UserTable
          users={users}
          mailEnabled={mailEnabled}
          smsEnabled={smsEnabled}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onOpenQuota={handleOpenQuota}
          userTab={userTab}
          loading={loading}
        />
      </div>

      {editingUser ? (
        <EditUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          roles={roles}
          mailEnabled={mailEnabled}
          loading={loading}
          user={editingUser}
          formData={formData}
          formErrors={formErrors}
          onFormChange={handleFormChange}
        />
      ) : (
        <CreateUserModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          roles={roles}
          mailEnabled={mailEnabled}
          loading={loading}
          formData={formData}
          formErrors={formErrors}
          onFormChange={handleFormChange}
        />
      )}

      <DeleteUserConfirm
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        loading={loading}
        deleteImmediately={deleteImmediately}
        onDeleteImmediatelyChange={setDeleteImmediately}
      />

      <UserQuotaModal
        isOpen={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        onSave={async () => {
          if (!quotaNodeId) return;
          setQuotaLoading(true);
          try {
            await updateStorageQuota(quotaNodeId, userQuota);
            showSuccess('配额更新成功');
            setQuotaModalOpen(false);
          } catch {
            // Error handled by hook
          } finally {
            setQuotaLoading(false);
          }
        }}
        loading={quotaLoading}
        user={quotaUser}
        quota={userQuota}
        defaultQuota={defaultQuota}
        onQuotaChange={setUserQuota}
      />

      <Modal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        title="清理已注销用户数据"
        className="max-w-md"
        footer={
          <div className="modal-footer">
            <Button variant="ghost" onClick={() => setCleanupModalOpen(false)} disabled={cleanupLoading}>取消</Button>
            <Button
              onClick={async () => {
                setCleanupLoading(true);
                try {
                  const result = await triggerCleanup();
                  showSuccess(result?.message || '清理完成');
                  setCleanupModalOpen(false);
                  await loadUsers();
                } catch {
                  // Error handled by hook
                } finally {
                  setCleanupLoading(false);
                }
              }}
              disabled={cleanupLoading}
              className="submit-btn"
            >
              {cleanupLoading ? <><Loader2 size={16} className="animate-spin" />清理中...</> : <><Sparkles size={16} className="mr-1" />立即清理</>}
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
