import { Plus, Trash2, AlertCircle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { DescriptionText } from '../components/ui/TruncateText';
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

export const RoleManagement = () => {
  useDocumentTitle('角色权限');
  const { hasPermission, hasRole } = usePermission();
  const [activeTab, setActiveTab] = useState<'system' | 'project'>('project');

  // 搜索和过滤状态
  const [searchQuery, setSearchQuery] = useState('');

  // 系统角色状态
  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(
    null
  );
  const [systemRoleName, setSystemRoleName] = useState('');
  const [systemRoleDesc, setSystemRoleDesc] = useState('');
  const [selectedSystemPerms, setSelectedSystemPerms] = useState<string[]>([]);

  // 删除确认模态框状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

  // 错误提示模态框状态
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  // 项目角色状态
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectRole, setEditingProjectRole] =
    useState<ProjectRole | null>(null);
  const [projectRoleName, setProjectRoleName] = useState('');
  const [projectRoleDesc, setProjectRoleDesc] = useState('');
  const [selectedProjectPerms, setSelectedProjectPerms] = useState<string[]>(
    []
  );

  // 获取当前用户信息
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadSystemRoles();
    loadProjectRoles();
  }, []);

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
    // 提取权限值（可能是字符串数组或对象数组）
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
      setErrorModalMessage('请输入角色名称');
      setErrorModalOpen(true);
      return;
    }

    try {
      if (editingSystemRole) {
        await rolesApi.update(editingSystemRole.id, {
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
        });
      } else {
        await rolesApi.create({
          name: systemRoleName,
          description: systemRoleDesc,
          permissions: selectedSystemPerms,
          category: 'CUSTOM',
          level: 0,
        });
      }

      setSystemModalOpen(false);
      loadSystemRoles();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
        (error as Error).message ||
        '保存失败';
      setErrorModalMessage(message);
      setErrorModalOpen(true);
    }
  };

  const handleDeleteSystemRole = (id: string) => {
    setRoleToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteSystemRole = async () => {
    if (!roleToDelete) return;

    try {
      await rolesApi.delete(roleToDelete);
      loadSystemRoles();
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    } catch (error) {
      console.error('删除角色失败:', error);
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || '删除失败';
      setErrorModalMessage(message);
      setErrorModalOpen(true);
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    }
  };

  const cancelDeleteSystemRole = () => {
    setDeleteConfirmOpen(false);
    setRoleToDelete(null);
  };

  const closeErrorModal = () => {
    setErrorModalOpen(false);
    setErrorModalMessage('');
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
    // 提取权限值（可能是字符串数组或对象数组）
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
      setErrorModalMessage('请输入角色名称');
      setErrorModalOpen(true);
      return;
    }

    try {
      if (editingProjectRole) {
        await projectRolesApi.update(editingProjectRole.id, {
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
      } else {
        await projectRolesApi.create({
          name: projectRoleName,
          description: projectRoleDesc,
          permissions: selectedProjectPerms,
        });
      }

      setProjectModalOpen(false);
      loadProjectRoles();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
        (error as Error).message ||
        '保存失败';
      setErrorModalMessage(message);
      setErrorModalOpen(true);
    }
  };

  const handleDeleteProjectRole = (id: string) => {
    // 系统项目角色不允许删除
    setErrorModalMessage('系统默认项目角色不允许删除');
    setErrorModalOpen(true);
  };

  // 过滤后的系统角色
  const filteredSystemRoles = systemRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description &&
        role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 过滤后的项目角色
  const filteredProjectRoles = projectRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description &&
        role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">角色与权限</h1>
          <p className="text-slate-500 mt-1">
            管理系统角色和项目角色及其操作权限
          </p>
        </div>
        <input
          type="text"
          placeholder="搜索角色..."
          className="px-4 py-2 border border-slate-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Tab 切换 */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('project')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'project'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            项目角色
          </button>
          {hasPermission(SystemPermission.SYSTEM_ROLE_READ) && (
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'system'
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              系统角色
            </button>
          )}
        </div>
      </div>

      {/* 项目角色模块（需要 SYSTEM_ROLE_READ 权限） */}
      {activeTab === 'project' &&
        hasPermission(SystemPermission.SYSTEM_ROLE_READ) && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">项目角色</h2>
                <p className="text-sm text-slate-500 mt-1">
                  系统默认项目角色，所有项目共享使用
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasPermission(SystemPermission.SYSTEM_ROLE_CREATE) && (
                  <Button icon={Plus} onClick={handleCreateProjectRole}>
                    新建角色
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjectRoles.map((role) => (
                <div
                  key={role.id}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col ${
                    role.isSystem
                      ? 'border-slate-200'
                      : 'border-2 border-emerald-200'
                  }`}
                >
                  <div
                    className={`p-6 border-b border-slate-100 flex items-start justify-between ${
                      role.isSystem ? '' : 'bg-emerald-50/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          {getRoleDisplayName(role.name, role.isSystem)}
                          {role.isSystem && (
                            <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                              系统
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          <DescriptionText>
                            {role.description || ''}
                          </DescriptionText>
                        </p>
                        {!role.isSystem && (
                          <p className="text-xs text-slate-400 mt-2">
                            {role._count.members} 个成员
                          </p>
                        )}
                      </div>
                    </div>
                    {!role.isSystem &&
                      hasPermission(SystemPermission.SYSTEM_ROLE_DELETE) && (
                        <button
                          onClick={() => handleDeleteProjectRole(role.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                  </div>
                  <div className="p-6 flex-1 bg-slate-50/50">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      拥有权限
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions
                        .slice(0, 6)
                        .map(
                          (p: string | { permission: string; id?: string }) => {
                            const permKey =
                              typeof p === 'string' ? p : p?.permission || '';
                            const systemPermissions = (
                              PERMISSION_GROUPS.system as unknown as {
                                items: { key: string; label: string }[];
                              }[]
                            ).flatMap((g) => g.items);
                            const permItem = systemPermissions.find(
                              (item) => item.key === permKey
                            );
                            const label = permItem
                              ? permItem.label
                              : permKey.split('_').slice(1).join('_');

                            return (
                              <span
                                key={
                                  typeof p === 'string' ? p : p.id || permKey
                                }
                                className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600"
                              >
                                {label}
                              </span>
                            );
                          }
                        )}
                      {role.permissions.length > 6 && (
                        <span className="text-xs px-2 py-1 text-slate-400">
                          +{role.permissions.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                  {hasPermission(
                    SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE
                  ) && (
                    <div className="p-4 border-t border-slate-100">
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
          </>
        )}

      {/* 无权限提示 */}
      {activeTab === 'project' &&
        !hasPermission(SystemPermission.SYSTEM_ROLE_READ) && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-slate-500">您没有权限访问此页面</p>
          </div>
        )}

      {/* 系统角色模块（仅管理员可见） */}
      {activeTab === 'system' &&
        hasPermission(SystemPermission.SYSTEM_ROLE_READ) && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">系统角色</h2>
                <p className="text-sm text-slate-500 mt-1">
                  管理系统用户的角色和权限，系统默认角色不可删除
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasPermission(SystemPermission.SYSTEM_ROLE_CREATE) && (
                  <Button icon={Plus} onClick={handleCreateSystemRole}>
                    新建角色
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSystemRoles.map((role) => (
                <div
                  key={role.id}
                  className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col ${
                    role.isSystem
                      ? 'border-slate-200'
                      : 'border-2 border-emerald-200'
                  }`}
                >
                  <div
                    className={`p-6 border-b border-slate-100 flex items-start justify-between ${
                      role.isSystem ? '' : 'bg-emerald-50/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          {getRoleDisplayName(role.name, role.isSystem)}
                          {role.isSystem && (
                            <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                              系统
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          <DescriptionText>
                            {role.description || ''}
                          </DescriptionText>
                        </p>
                      </div>
                    </div>
                    {!role.isSystem && (
                      <button
                        onClick={() => handleDeleteSystemRole(role.id)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                  <div className="p-6 flex-1 bg-slate-50/50">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      拥有权限
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions
                        .slice(0, 6)
                        .map(
                          (p: string | { permission: string; id?: string }) => {
                            const permKey =
                              typeof p === 'string' ? p : p?.permission || '';
                            const projectPermissions = (
                              PERMISSION_GROUPS.project as unknown as {
                                items: { key: string; label: string }[];
                              }[]
                            ).flatMap((g) => g.items);
                            const permItem = projectPermissions.find(
                              (item) => item.key === permKey
                            );
                            const label = permItem
                              ? permItem.label
                              : permKey.split('_').slice(1).join('_');

                            return (
                              <span
                                key={
                                  typeof p === 'string' ? p : p.id || permKey
                                }
                                className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-600"
                              >
                                {label}
                              </span>
                            );
                          }
                        )}
                      {role.permissions.length > 6 && (
                        <span className="text-xs px-2 py-1 text-slate-400">
                          +{role.permissions.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 border-t border-slate-100">
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
          </>
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
        isEditingSystemRole={
          !!editingProjectRole && editingProjectRole.isSystem
        }
        permissionType="project"
      />

      {/* 删除确认模态框 */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDeleteSystemRole}
        title="确认删除角色"
        footer={
          <>
            <Button variant="ghost" onClick={cancelDeleteSystemRole}>
              取消
            </Button>
            <Button
              onClick={confirmDeleteSystemRole}
              className="bg-red-600 hover:bg-red-700"
            >
              确认删除
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle
              size={20}
              className="text-amber-600 flex-shrink-0 mt-0.5"
            />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">重要提示</p>
              <p className="text-amber-800">
                删除后，属于该角色的用户将需要重新分配角色。
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            确定要删除该角色吗？此操作不可恢复。
          </p>
        </div>
      </Modal>

      {/* 错误提示模态框 */}
      <Modal
        isOpen={errorModalOpen}
        onClose={closeErrorModal}
        title="提示"
        footer={
          <Button onClick={closeErrorModal} className="w-full sm:w-auto">
            确定
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            size={20}
            className="text-amber-600 flex-shrink-0 mt-0.5"
          />
          <p className="text-sm text-slate-700">{errorModalMessage}</p>
        </div>
      </Modal>
    </div>
  );
};
