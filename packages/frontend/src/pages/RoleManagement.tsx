///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Shield } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Search } from 'lucide-react';
import { Users } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { XCircle } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PermissionConfigModal } from '../components/permission/PermissionAssignment';
import { rolesControllerCreate, rolesControllerFindAll, rolesControllerUpdate, rolesControllerRemove, rolesControllerCreateProjectRole, rolesControllerGetSystemProjectRoles, rolesControllerUpdateProjectRole, rolesControllerDeleteProjectRole } from '@/api-sdk';
import { authControllerGetProfile } from '@/api-sdk';
import { usePermission } from '../hooks/usePermission';
import {
  PERMISSION_GROUPS,
  getRoleDisplayName,
  SystemPermission,
} from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../contexts/ThemeContext';
import type { UserResponseDto as UserDto } from '@/api-sdk';
import { roleManagementStyles } from './RoleManagementStyles';
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
      const { data: response } = await authControllerGetProfile();
      setCurrentUser(response as unknown as UserDto);
    } catch (error) {
      console.error('加载用户信息失败:', error);
    }
  };

  const loadSystemRoles = async () => {
    try {
      const { data: response } = await rolesControllerFindAll();
      setSystemRoles(response as unknown as SystemRole[]);
    } catch (error) {
      console.error('加载系统角色失败:', error);
    }
  };

  const loadProjectRoles = async () => {
    try {
      const { data: response } = await rolesControllerGetSystemProjectRoles();
      setProjectRoles(response as unknown as ProjectRole[]);
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
        await rolesControllerUpdate({
          path: { id: editingSystemRole.id },
          body: {
            name: systemRoleName,
            description: systemRoleDesc,
            permissions: selectedSystemPerms,
          },
        });
        showSuccess('角色更新成功');
      } else {
        await rolesControllerCreate({
          body: {
            name: systemRoleName,
            description: systemRoleDesc,
            permissions: selectedSystemPerms,
            category: 'CUSTOM',
            level: 0,
          },
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
        await rolesControllerUpdateProjectRole({
          path: { id: editingProjectRole.id },
          body: {
            name: projectRoleName,
            description: projectRoleDesc,
            permissions: selectedProjectPerms,
          },
        });
        showSuccess('角色更新成功');
      } else {
        await rolesControllerCreateProjectRole({
          body: {
            name: projectRoleName,
            description: projectRoleDesc,
            permissions: selectedProjectPerms,
          },
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
        await rolesControllerRemove({ path: { id: roleToDelete } });
        loadSystemRoles();
      } else {
        await rolesControllerDeleteProjectRole({ path: { id: roleToDelete } });
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
            data-tour="system-roles-tab"
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
              <Button onClick={handleCreateSystemRole} disabled={loading} data-tour="create-role-btn">
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

export default RoleManagement;
