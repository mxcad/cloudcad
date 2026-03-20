///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import Shield from 'lucide-react/dist/esm/icons/shield';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Search from 'lucide-react/dist/esm/icons/search';
import Users from 'lucide-react/dist/esm/icons/users';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import XCircle from 'lucide-react/dist/esm/icons/x-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PermissionConfigModal } from '../components/permission/PermissionAssignment';
import { rolesApi, projectRolesApi } from '../services/rolesApi';
import { authApi } from '../services/authApi';
import { usePermission } from '../hooks/usePermission';
import {
  PERMISSION_GROUPS,
  getRoleDisplayName,
  SystemPermission,
} from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';
import type { UserResponseDto as UserDto } from '../types/api-client';

type SystemRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

type ProjectRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
  };
};

/**
 * 角色管理页面 - CloudCAD
 * 
 * 设计特色：
 * - 使用 CSS 变量适配深色/亮色主题
 * - 精美的卡片式布局
 * - 流畅的动画效果
 * - 专业的角色权限配置
 */
export const RoleManagement = () => {
  useDocumentTitle('角色权限');
  const { isDark } = useTheme();
  const { hasPermission } = usePermission();
  const [activeTab, setActiveTab] = useState<'system' | 'project'>('project');

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 系统角色状态
  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(null);
  const [systemRoleName, setSystemRoleName] = useState('');
  const [systemRoleDesc, setSystemRoleDesc] = useState('');
  const [selectedSystemPerms, setSelectedSystemPerms] = useState<string[]>([]);

  // 删除确认模态框状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'system' | 'project'>('system');

  // 错误提示模态框状态
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  // 成功提示
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 项目角色状态
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectRole, setEditingProjectRole] = useState<ProjectRole | null>(null);
  const [projectRoleName, setProjectRoleName] = useState('');
  const [projectRoleDesc, setProjectRoleDesc] = useState('');
  const [selectedProjectPerms, setSelectedProjectPerms] = useState<string[]>([]);

  // 获取当前用户信息
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCurrentUser(),
        loadSystemRoles(),
        loadProjectRoles(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const response = await authApi.getProfile();
      setCurrentUser(response.data as unknown as UserDto);
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  };

  const loadSystemRoles = async () => {
    try {
      const response = await rolesApi.list();
      setSystemRoles(response.data);
    } catch (error) {
      console.error('加载系统角色失败:', error);
    }
  };

  const loadProjectRoles = async () => {
    try {
      const response = await projectRolesApi.getSystemRoles();
      setProjectRoles(response.data as unknown as ProjectRole[]);
    } catch (error) {
      console.error('加载项目角色失败:', error);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const showError = (message: string) => {
    setErrorModalMessage(message);
    setErrorModalOpen(true);
  };

  // 系统角色操作
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

    setLoading(true);
    try {
      if (editingSystemRole) {
        await rolesApi.update(editingSystemRole.id, {
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
        });
        showSuccess('角色更新成功');
      } else {
        await rolesApi.create({
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
          category: 'CUSTOM',
          level: 0,
        });
        showSuccess('角色创建成功');
      }

      setSystemModalOpen(false);
      loadSystemRoles();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (error as Error).message ||
        '保存失败';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSystemRole = (id: string) => {
    setRoleToDelete(id);
    setDeleteType('system');
    setDeleteConfirmOpen(true);
  };

  // 项目角色操作
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

    setLoading(true);
    try {
      if (editingProjectRole) {
        await projectRolesApi.update(editingProjectRole.id, {
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
        showSuccess('角色更新成功');
      } else {
        await projectRolesApi.create({
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
        showSuccess('角色创建成功');
      }

      setProjectModalOpen(false);
      loadProjectRoles();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (error as Error).message ||
        '保存失败';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProjectRole = (id: string) => {
    const role = projectRoles.find(r => r.id === id);
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

    setLoading(true);
    try {
      if (deleteType === 'system') {
        await rolesApi.delete(roleToDelete);
        loadSystemRoles();
      } else {
        await projectRolesApi.delete(roleToDelete);
        loadProjectRoles();
      }
      showSuccess('角色删除成功');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        '删除失败';
      showError(message);
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    }
  };

  // 过滤后的角色列表
  const filteredSystemRoles = systemRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredProjectRoles = projectRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 权限检查
  const canReadSystemRoles = hasPermission(SystemPermission.SYSTEM_ROLE_READ);
  const canCreateRoles = hasPermission(SystemPermission.SYSTEM_ROLE_CREATE);
  const canDeleteRoles = hasPermission(SystemPermission.SYSTEM_ROLE_DELETE);
  const canManagePermissions = hasPermission(SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE);

  // 渲染权限标签
  const renderPermissionTags = (permissions: string[], type: 'system' | 'project') => {
    const groups = PERMISSION_GROUPS[type] as unknown as { items: { key: string; label: string }[] }[];
    const allPerms = groups.flatMap(g => g.items);
    
    return permissions.slice(0, 6).map((p) => {
      const permKey = typeof p === 'string' ? p : (p as { permission?: string })?.permission || '';
      const permItem = allPerms.find(item => item.key === permKey);
      const label = permItem ? permItem.label : permKey.split('_').slice(1).join('_');
      
      return (
        <span key={permKey} className="permission-tag">
          {label}
        </span>
      );
    });
  };

  // 无权限状态
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
      {/* 成功提示 */}
      {successMessage && (
        <div className="success-toast">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 页面头部 */}
      <div className="page-header">
        <div className="page-title-section">
          <div className="page-title-icon">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="page-title">角色与权限</h1>
            <p className="page-subtitle">
              管理系统角色和项目角色及其操作权限
            </p>
          </div>
        </div>
        
        {/* 搜索框 */}
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

      {/* Tab 切换 */}
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
          >
            <Shield size={16} />
            系统角色
          </button>
        )}
      </div>

      {/* 项目角色模块 */}
      {activeTab === 'project' && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">项目角色</h2>
              <p className="section-subtitle">
                系统默认项目角色，所有项目共享使用
              </p>
            </div>
            {canCreateRoles && (
              <Button onClick={handleCreateProjectRole} disabled={loading}>
                <Plus size={18} />
                新建角色
              </Button>
            )}
          </div>

          <div className="roles-grid">
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
                      <p className="role-members">
                        {role._count.members} 个成员
                      </p>
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
                      <span className="more-tag">
                        +{role.permissions.length - 6}
                      </span>
                    )}
                  </div>
                </div>

                {canManagePermissions && (
                  <div className="role-card-footer">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleEditProjectRole(role)}
                    >
                      配置权限
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 系统角色模块 */}
      {activeTab === 'system' && canReadSystemRoles && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">系统角色</h2>
              <p className="section-subtitle">
                管理系统用户的角色和权限，系统默认角色不可删除
              </p>
            </div>
            {canCreateRoles && (
              <Button onClick={handleCreateSystemRole} disabled={loading}>
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
                      <span className="more-tag">
                        +{role.permissions.length - 6}
                      </span>
                    )}
                  </div>
                </div>

                <div className="role-card-footer">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleEditSystemRole(role)}
                  >
                    配置权限
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 系统角色权限配置弹窗 */}
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
        loading={loading}
      />

      {/* 项目角色权限配置弹窗 */}
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
        loading={loading}
      />

      {/* 删除确认模态框 */}
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

      {/* 错误提示模态框 */}
      <Modal
        isOpen={errorModalOpen}
        onClose={() => {
          setErrorModalOpen(false);
          setErrorModalMessage('');
        }}
        title="提示"
        footer={
          <Button onClick={() => setErrorModalOpen(false)}>
            确定
          </Button>
        }
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

// CSS 样式
const roleManagementStyles = `
  /* ===== 容器基础 ===== */
  .role-management-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--space-6);
    animation: fadeIn 0.4s ease-out;
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-primary) 100%);
    background-attachment: fixed;
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

  /* ===== 页面头部 ===== */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-6);
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-sm);
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
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--primary-500), var(--accent-500));
    border-radius: var(--radius-xl);
    color: white;
    box-shadow: var(--shadow-md), 0 0 20px rgba(99, 102, 241, 0.3);
    transition: all 0.3s ease;
  }

  .page-title-icon:hover {
    transform: scale(1.05) rotate(5deg);
    box-shadow: var(--shadow-lg), 0 0 30px rgba(99, 102, 241, 0.4);
  }

  .page-title {
    font-size: 1.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--text-primary), var(--primary-500));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .page-subtitle {
    font-size: 0.9375rem;
    color: var(--text-tertiary);
    margin: 0.375rem 0 0;
  }

  /* ===== 搜索框 ===== */
  .search-input-wrapper {
    position: relative;
    flex: 0 0 320px;
  }

  .search-icon {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .search-input-wrapper:focus-within .search-icon {
    color: var(--primary-500);
    transform: translateY(-50%) scale(1.1);
  }

  .search-input {
    width: 100%;
    padding: var(--space-3) var(--space-4) var(--space-3) 2.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.25s ease;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:hover {
    border-color: var(--border-strong);
    background: var(--bg-secondary);
  }

  .search-input:focus {
    border-color: var(--primary-500);
    box-shadow: 0 0 0 3px var(--primary-100), var(--shadow-md);
    background: var(--bg-secondary);
  }

  [data-theme="dark"] .search-input:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), var(--shadow-md);
  }

  /* ===== Tab 切换 ===== */
  .tabs-container {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--bg-tertiary);
    border-radius: var(--radius-xl);
    margin-bottom: var(--space-6);
    width: fit-content;
    border: 1px solid var(--border-subtle);
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: transparent;
    border: none;
    border-radius: var(--radius-lg);
    color: var(--text-tertiary);
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
  }

  .tab-button:hover {
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  .tab-button.active {
    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
    color: white;
    box-shadow: var(--shadow-md);
  }

  .tab-button.active:hover {
    background: linear-gradient(135deg, var(--primary-600), var(--primary-700));
    transform: translateY(-1px);
  }

  /* ===== 角色模块 ===== */
  .roles-section {
    margin-bottom: var(--space-8);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-subtitle {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin: 0.25rem 0 0;
  }

  /* ===== 角色卡片网格 ===== */
  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-5);
  }

  @media (max-width: 1200px) {
    .roles-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .roles-grid {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }
  }

  /* ===== 角色卡片 ===== */
  .role-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    animation: cardFadeIn 0.5s ease-out backwards;
    position: relative;
  }

  @keyframes cardFadeIn {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .role-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-500), var(--accent-500));
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .role-card:hover {
    border-color: var(--primary-300);
    box-shadow: var(--shadow-xl), 0 0 40px rgba(99, 102, 241, 0.1);
    transform: translateY(-4px);
  }

  .role-card:hover::before {
    opacity: 1;
  }

  .role-card.system-role::before {
    background: linear-gradient(90deg, var(--accent-500), var(--accent-400));
  }

  .role-card.custom-role {
    border: 1px solid var(--success);
    background: linear-gradient(
      135deg,
      var(--bg-secondary) 0%,
      rgba(34, 197, 94, 0.03) 50%,
      var(--bg-secondary) 100%
    );
  }

  [data-theme="dark"] .role-card.custom-role {
    background: linear-gradient(
      135deg,
      var(--bg-secondary) 0%,
      rgba(34, 197, 94, 0.08) 50%,
      var(--bg-secondary) 100%
    );
  }

  .role-card.custom-role::before {
    background: linear-gradient(90deg, var(--success), #4ade80);
  }

  /* 卡片头部 */
  .role-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
  }

  .role-info {
    flex: 1;
    min-width: 0;
  }

  .role-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .system-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    background: var(--primary-100);
    color: var(--primary-600);
    border-radius: var(--radius-full);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  [data-theme="dark"] .system-badge {
    background: var(--primary-100);
    color: var(--primary-400);
  }

  .role-description {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin: var(--space-2) 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-members {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: var(--space-2) 0 0;
  }

  .delete-btn {
    padding: var(--space-2);
    background: transparent;
    border: none;
    color: var(--text-muted);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: var(--error-dim);
    color: var(--error);
  }

  /* 权限区域 */
  .role-permissions {
    padding: var(--space-5);
    background: var(--bg-tertiary);
    flex: 1;
  }

  .permissions-title {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 var(--space-3);
  }

  .permissions-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .permission-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .permission-tag:hover {
    background: var(--primary-100);
    border-color: var(--primary-300);
    color: var(--primary-600);
    transform: translateY(-1px);
  }

  [data-theme="dark"] .permission-tag:hover {
    background: rgba(99, 102, 241, 0.15);
    border-color: var(--primary-500);
    color: var(--primary-400);
  }

  .more-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    background: var(--bg-elevated);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* 卡片底部 */
  .role-card-footer {
    padding: var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }

  /* ===== 无权限状态 ===== */
  .access-denied-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    text-align: center;
  }

  .access-denied-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: var(--warning-dim);
    border-radius: var(--radius-full);
    color: var(--warning);
    margin-bottom: var(--space-6);
  }

  .access-denied-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .access-denied-text {
    font-size: 1rem;
    color: var(--text-secondary);
    margin: var(--space-3) 0 0;
  }

  .access-denied-hint {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin: var(--space-2) 0 0;
  }

  /* ===== 模态框相关 ===== */
  .modal-footer {
    display: flex;
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    .modal-footer {
      flex-direction: column-reverse;
      width: 100%;
    }

    .modal-footer button {
      width: 100%;
    }

    .delete-warning-box {
      padding: var(--space-3);
    }

    .error-modal-content {
      padding: var(--space-1);
    }
  }

  .danger-btn {
    background: var(--error) !important;
    border-color: var(--error) !important;
  }

  .danger-btn:hover {
    background: #dc2626 !important;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.3) !important;
  }

  .delete-confirm-content {
    padding: var(--space-2);
  }

  .delete-warning-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--warning-dim);
    border: 1px solid var(--warning);
    border-radius: var(--radius-xl);
    color: var(--warning);
  }

  .delete-warning-title {
    font-weight: 600;
    margin: 0 0 var(--space-1);
    font-size: 0.9375rem;
  }

  .delete-warning-text {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.9;
  }

  .error-modal-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2);
  }

  .error-icon {
    color: var(--warning);
    flex-shrink: 0;
  }

  /* ===== 动画类 ===== */
  .animate-spin {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ===== 响应式调整 ===== */
  @media (max-width: 768px) {
    .role-management-container {
      padding: var(--space-4);
    }

    .page-header {
      flex-direction: column;
      align-items: stretch;
      padding: var(--space-4);
    }

    .page-title {
      font-size: 1.5rem;
    }

    .page-title-icon {
      width: 48px;
      height: 48px;
    }

    .search-input-wrapper {
      flex: 1;
      width: 100%;
    }

    .tabs-container {
      width: 100%;
    }

    .tab-button {
      flex: 1;
      justify-content: center;
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
    }
  }

  @media (max-width: 640px) {
    .role-management-container {
      padding: var(--space-3);
    }

    .page-header {
      padding: var(--space-3);
      gap: var(--space-3);
    }

    .page-title-section {
      margin-bottom: var(--space-2);
    }

    .page-title {
      font-size: 1.25rem;
    }

    .page-subtitle {
      font-size: 0.875rem;
    }

    .role-card-header {
      padding: var(--space-4);
    }

    .role-permissions {
      padding: var(--space-4);
    }

    .permission-tag {
      font-size: 0.6875rem;
      padding: 0.25rem 0.5rem;
    }
  }

  /* 小屏手机适配 */
  @media (max-width: 375px) {
    .page-title {
      font-size: 1.125rem;
    }

    .role-name {
      font-size: 1rem;
    }

    .section-title {
      font-size: 1.125rem;
    }
  }
`;