import { Shield } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Search } from 'lucide-react';
import { Users } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { XCircle } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PermissionConfigModal } from '../components/permission/PermissionAssignment';
import { usePermission } from '../hooks/usePermission';
import {
  PERMISSION_GROUPS,
  getRoleDisplayName,
  SystemPermission,
} from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';
import { useRoleCRUD, type SystemRole, type ProjectRole } from '../hooks/useRoleCRUD';
import { roleManagementStyles } from './RoleManagementStyles';

export const RoleManagement = () => {
  useDocumentTitle('角色权限');
  const { isDark } = useTheme();
  const { hasPermission } = usePermission();
  const {
    systemRoles,
    projectRoles,
    currentUser,
    isLoading,
    createSystemRole,
    updateSystemRole,
    deleteSystemRole,
    createProjectRole,
    updateProjectRole,
    deleteProjectRole,
  } = useRoleCRUD();

  const [activeTab, setActiveTab] = useState<'system' | 'project'>('project');
  const [searchQuery, setSearchQuery] = useState('');

  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(null);
  const [systemRoleName, setSystemRoleName] = useState('');
  const [systemRoleDesc, setSystemRoleDesc] = useState('');
  const [selectedSystemPerms, setSelectedSystemPerms] = useState<string[]>([]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'system' | 'project'>('system');

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectRole, setEditingProjectRole] = useState<ProjectRole | null>(null);
  const [projectRoleName, setProjectRoleName] = useState('');
  const [projectRoleDesc, setProjectRoleDesc] = useState('');
  const [selectedProjectPerms, setSelectedProjectPerms] = useState<string[]>([]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const showError = (message: string) => {
    setErrorModalMessage(message);
    setErrorModalOpen(true);
  };

  const handleCreateSystemRole = () => {
    setEditingSystemRole(null);
    setSystemRoleName('');
    setSystemRoleDesc('');
    setSelectedSystemPerms([]);
    setSystemModalOpen(true);
  };

  const handleEditSystemRole = (role: SystemRole) => {
    setEditingSystemRole(role);
    setSystemRoleName(role.name);
    setSystemRoleDesc(role.description || '');
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
          .map((p: string | { permission: string }) => {
            if (typeof p === 'string') return p;
            if (p && p.permission) return p.permission;
            return null;
          })
          .filter((p): p is string => p !== null)
      : [];
    setSelectedSystemPerms(permissions);
    setSystemModalOpen(true);
  };

  const handleSaveSystemRole = async () => {
    if (!systemRoleName) {
      showError('请输入角色名称');
      return;
    }

    try {
      if (editingSystemRole) {
        await updateSystemRole(editingSystemRole.id, {
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
        });
        showSuccess('角色更新成功');
      } else {
        await createSystemRole({
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
        });
        showSuccess('角色创建成功');
      }
      setSystemModalOpen(false);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (error as Error).message ||
        '保存失败';
      showError(message);
    }
  };

  const handleDeleteSystemRole = (id: string) => {
    setRoleToDelete(id);
    setDeleteType('system');
    setDeleteConfirmOpen(true);
  };

  const handleCreateProjectRole = () => {
    setEditingProjectRole(null);
    setProjectRoleName('');
    setProjectRoleDesc('');
    setSelectedProjectPerms([]);
    setProjectModalOpen(true);
  };

  const handleEditProjectRole = (role: ProjectRole) => {
    setEditingProjectRole(role);
    setProjectRoleName(role.name);
    setProjectRoleDesc(role.description || '');
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
          .map((p: string | { permission: string }) => {
            if (typeof p === 'string') return p;
            if (p && p.permission) return p.permission;
            return null;
          })
          .filter((p): p is string => p !== null)
      : [];
    setSelectedProjectPerms(permissions);
    setProjectModalOpen(true);
  };

  const handleSaveProjectRole = async () => {
    if (!projectRoleName) {
      showError('请输入角色名称');
      return;
    }

    try {
      if (editingProjectRole) {
        await updateProjectRole(editingProjectRole.id, {
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
        showSuccess('角色更新成功');
      } else {
        await createProjectRole({
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
        showSuccess('角色创建成功');
      }
      setProjectModalOpen(false);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (error as Error).message ||
        '保存失败';
      showError(message);
    }
  };

  const handleDeleteProjectRole = (id: string) => {
    const role = projectRoles.find((r) => r.id === id);
    if (role?.isSystem) {
      showError('系统默认项目角色不允许删除');
      return;
    }
    setRoleToDelete(id);
    setDeleteType('project');
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;

    try {
      if (deleteType === 'system') {
        await deleteSystemRole(roleToDelete);
      } else {
        await deleteProjectRole(roleToDelete);
      }
      showSuccess('角色删除成功');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        '删除失败';
      showError(message);
    } finally {
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    }
  };

  const filteredSystemRoles = systemRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const filteredProjectRoles = projectRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const canReadSystemRoles = hasPermission(SystemPermission.SYSTEM_ROLE_READ);
  const canCreateRoles = hasPermission(SystemPermission.SYSTEM_ROLE_CREATE);
  const canDeleteRoles = hasPermission(SystemPermission.SYSTEM_ROLE_DELETE);
  const canManagePermissions = hasPermission(SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE);

  const renderPermissionTags = (permissions: string[], type: 'system' | 'project') => {
    const groups = PERMISSION_GROUPS[type] as unknown as { items: { key: string; label: string }[] }[];
    const allPerms = groups.flatMap((g) => g.items);

    return permissions.slice(0, 6).map((p) => {
      const permKey = typeof p === 'string' ? p : (p as { permission?: string })?.permission || '';
      const permItem = allPerms.find((item) => item.key === permKey);
      const label = permItem ? permItem.label : permKey.split('_').slice(1).join('_');

      return (
        <span key={permKey} className="permission-tag">
          {label}
        </span>
      );
    });
  };

  if (!canReadSystemRoles) {
    return (
      <div className="role-management-container">
        <div className="access-denied-state">
          <div className="access-denied-icon">
            <AlertCircle size={48} />
          </div>
          <h2 className="access-denied-title">访问被拒绝</h2>
          <p className="access-denied-text">您没有权限访问此页面。</p>
          <p className="access-denied-hint">请联系管理员获取角色管理权限。</p>
        </div>
        <style>{roleManagementStyles}</style>
      </div>
    );
  }

  return (
    <div className="role-management-container">
      {successMessage && (
        <div className="success-toast">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="page-header">
        <div className="page-title-section">
          <div className="page-title-icon">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="page-title">角色与权限</h1>
            <p className="page-subtitle">管理系统角色和项目角色及其操作权限</p>
          </div>
        </div>

        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="搜索角色..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="tabs-container">
        <button
          onClick={() => setActiveTab('project')}
          className={`tab-button ${activeTab === 'project' ? 'active' : ''}`}
        >
          <Users size={16} />
          项目角色
        </button>
        {canReadSystemRoles && (
          <button
            onClick={() => setActiveTab('system')}
            className={`tab-button ${activeTab === 'system' ? 'active' : ''}`}
            data-tour="system-roles-tab"
          >
            <Shield size={16} />
            系统角色
          </button>
        )}
      </div>

      {activeTab === 'project' && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">项目角色</h2>
              <p className="section-subtitle">系统默认项目角色，所有项目共享使用</p>
            </div>
            {canCreateRoles && (
              <Button onClick={handleCreateProjectRole} disabled={isLoading}>
                <Plus size={18} />
                新建角色
              </Button>
            )}
          </div>

          <div className="roles-grid" data-tour="role-list">
            {filteredProjectRoles.map((role, index) => (
              <div
                key={role.id}
                className={`role-card ${role.isSystem ? 'system-role' : 'custom-role'}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="role-card-header">
                  <div className="role-info">
                    <h3 className="role-name">
                      {getRoleDisplayName(role.name, role.isSystem)}
                      {role.isSystem && <span className="system-badge">系统</span>}
                    </h3>
                    <p className="role-description">{role.description || '暂无描述'}</p>
                    {!role.isSystem && (
                      <p className="role-members">{role._count.members} 个成员</p>
                    )}
                  </div>
                  {!role.isSystem && canDeleteRoles && (
                    <button
                      onClick={() => handleDeleteProjectRole(role.id)}
                      className="delete-btn"
                      title="删除角色"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="role-permissions">
                  <h4 className="permissions-title">拥有权限</h4>
                  <div className="permissions-list">
                    {renderPermissionTags(role.permissions, 'project')}
                    {role.permissions.length > 6 && (
                      <span className="more-tag">+{role.permissions.length - 6}</span>
                    )}
                  </div>
                </div>

                {canManagePermissions && (
                  <div className="role-card-footer">
                    <Button variant="outline" className="w-full" onClick={() => handleEditProjectRole(role)}>
                      配置权限
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'system' && canReadSystemRoles && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">系统角色</h2>
              <p className="section-subtitle">管理系统用户的角色和权限，系统默认角色不可删除</p>
            </div>
            {canCreateRoles && (
              <Button onClick={handleCreateSystemRole} disabled={isLoading} data-tour="create-role-btn">
                <Plus size={18} />
                新建角色
              </Button>
            )}
          </div>

          <div className="roles-grid">
            {filteredSystemRoles.map((role, index) => (
              <div
                key={role.id}
                className={`role-card ${role.isSystem ? 'system-role' : 'custom-role'}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="role-card-header">
                  <div className="role-info">
                    <h3 className="role-name">
                      {getRoleDisplayName(role.name, role.isSystem)}
                      {role.isSystem && <span className="system-badge">系统</span>}
                    </h3>
                    <p className="role-description">{role.description || '暂无描述'}</p>
                  </div>
                  {!role.isSystem && canDeleteRoles && (
                    <button
                      onClick={() => handleDeleteSystemRole(role.id)}
                      className="delete-btn"
                      title="删除角色"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="role-permissions">
                  <h4 className="permissions-title">拥有权限</h4>
                  <div className="permissions-list">
                    {renderPermissionTags(role.permissions, 'system')}
                    {role.permissions.length > 6 && (
                      <span className="more-tag">+{role.permissions.length - 6}</span>
                    )}
                  </div>
                </div>

                <div className="role-card-footer">
                  <Button variant="outline" className="w-full" onClick={() => handleEditSystemRole(role)}>
                    配置权限
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PermissionConfigModal
        isOpen={systemModalOpen}
        onClose={() => setSystemModalOpen(false)}
        title={editingSystemRole ? '配置系统角色权限' : '新建系统角色'}
        roleName={systemRoleName}
        roleDesc={systemRoleDesc}
        onNameChange={setSystemRoleName}
        onDescChange={setSystemRoleDesc}
        permissions={selectedSystemPerms}
        onPermissionsChange={setSelectedSystemPerms}
        onSave={handleSaveSystemRole}
        isSystemRole={editingSystemRole?.isSystem || false}
        isEditingSystemRole={!!editingSystemRole && editingSystemRole.isSystem}
        permissionType="system"
        loading={isLoading}
      />

      <PermissionConfigModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProjectRole ? '配置项目角色权限' : '新建项目角色'}
        roleName={projectRoleName}
        roleDesc={projectRoleDesc}
        onNameChange={setProjectRoleName}
        onDescChange={setProjectRoleDesc}
        permissions={selectedProjectPerms}
        onPermissionsChange={setSelectedProjectPerms}
        onSave={handleSaveProjectRole}
        isSystemRole={editingProjectRole?.isSystem || false}
        isEditingSystemRole={!!editingProjectRole && editingProjectRole.isSystem}
        permissionType="project"
        loading={isLoading}
      />

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setRoleToDelete(null);
        }}
        title="确认删除角色"
        footer={
          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setRoleToDelete(null);
              }}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button onClick={confirmDelete} disabled={isLoading} className="danger-btn">
              {isLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
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
                删除后，属于该角色的用户将需要重新分配角色。此操作不可恢复。
              </p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={errorModalOpen}
        onClose={() => {
          setErrorModalOpen(false);
          setErrorModalMessage('');
        }}
        title="提示"
        footer={<Button onClick={() => setErrorModalOpen(false)}>确定</Button>}
      >
        <div className="error-modal-content">
          <AlertCircle size={24} className="error-icon" />
          <p>{errorModalMessage}</p>
        </div>
      </Modal>

      <style>{roleManagementStyles}</style>
    </div>
  );
};

export default RoleManagement;