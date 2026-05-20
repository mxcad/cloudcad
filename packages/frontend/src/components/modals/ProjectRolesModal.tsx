import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { Settings } from 'lucide-react';
import { Shield } from 'lucide-react';
import { Users } from 'lucide-react';
import { Edit } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';
import { Modal } from '../ui/Modal';
import { Tabs, Tab } from '../ui';
import { DescriptionText } from '../ui/TruncateText';
import { PermissionConfigModal } from '../permission/PermissionAssignment';
import { useProjectRoleCRUD } from './hooks/useProjectRoleCRUD';
import { useProjectPermission } from '../../hooks/useProjectPermission';
import { useNotification } from '../../contexts/NotificationContext';
import { ProjectPermission } from '../../constants/permissions';
import type { ProjectRoleDto } from '@/api-sdk';

// 角色名称中文映射
const ROLE_NAME_MAP: Record<string, string> = {
  PROJECT_OWNER: '项目所有者',
  PROJECT_ADMIN: '项目管理员',
  PROJECT_MEMBER: '项目成员',
  PROJECT_EDITOR: '项目编辑者',
  PROJECT_VIEWER: '项目查看者',
};

// 获取角色中文名称
const getRoleDisplayName = (roleName: string): string => {
  return ROLE_NAME_MAP[roleName] || roleName;
};

interface ProjectRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const ProjectRolesModal: React.FC<ProjectRolesModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const { checkPermission } = useProjectPermission();
  const { showToast } = useNotification();
  const {
    roles,
    loading,
    error: hookError,
    systemRoles,
    customRoles,
    createRole,
    updateRole,
    deleteRole,
    reloadRoles,
  } = useProjectRoleCRUD(projectId);
  const [canManageRoles, setCanManageRoles] = useState(false);

  // Tab 切换状态
  const [activeTab, setActiveTab] = useState<'system' | 'custom'>('custom');

  // 权限配置弹窗状态
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ProjectRoleDto | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<ProjectRoleDto | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const hasManagePermission = await checkPermission(
        projectId,
        ProjectPermission.PROJECT_ROLE_MANAGE
      );
      setCanManageRoles(hasManagePermission);
    } catch (error) {
      console.error('检查角色管理权限失败:', error);
      setCanManageRoles(false);
    }
  }, [projectId, checkPermission]);

  useEffect(() => {
    if (isOpen) {
      loadPermissions();
    }
  }, [isOpen, loadPermissions]);

  // 创建角色
  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setSelectedPerms([]);
    setConfigModalOpen(true);
  };

  // 编辑角色
  const handleEditRole = (role: ProjectRoleDto) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description || '');
    const permissions = Array.isArray(role.permissions)
      ? role.permissions.map((p) => p.permission)
      : [];
    setSelectedPerms(permissions);
    setConfigModalOpen(true);
  };

  // 保存角色
  const handleSaveRole = async () => {
    if (!roleName) {
      showToast('请输入角色名称', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, {
          name: roleName,
          description: roleDesc,
          permissions: selectedPerms,
        });
        showToast('角色更新成功', 'success');
      } else {
        await createRole({
          name: roleName,
          description: roleDesc,
          permissions: selectedPerms,
        });
        showToast('角色创建成功', 'success');
      }

      setConfigModalOpen(false);
    } catch (error) {
      console.error('保存角色失败:', error);
      showToast(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          (error as Error).message ||
          '保存失败',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  // 删除角色
  const handleDeleteRole = (role: ProjectRoleDto) => {
    if (role.isSystem) {
      showToast('系统默认角色不允许删除', 'warning');
      return;
    }
    setRoleToDelete(role);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;

    try {
      await deleteRole(roleToDelete.id);
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    } catch (error) {
      console.error('删除角色失败:', error);
      showToast(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          (error as Error).message ||
          '删除失败',
        'error'
      );
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="项目角色管理"
        className="max-w-4xl"
        footer={
          <Button variant="ghost" onClick={onClose} data-tour="modal-close-btn">
            关闭
          </Button>
        }
      >
        <div className="space-y-6">
          {/* Tab 切换 */}
          <Tabs>
            <Tab active={activeTab === 'custom'} icon={Settings} onClick={() => setActiveTab('custom')}>
              自定义角色
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ({customRoles.length})
              </span>
            </Tab>
            <Tab active={activeTab === 'system'} icon={Shield} onClick={() => setActiveTab('system')} data-tour="system-roles-tab-btn">
              系统角色
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ({systemRoles.length})
              </span>
            </Tab>
          </Tabs>

          {/* 错误提示 */}
          {hookError && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--bg-error)', color: 'var(--error)' }}>
              <AlertCircle size={16} />
              {hookError}
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">加载中...</span>
            </div>
          )}

          {/* 角色列表 */}
          {!loading && (
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {/* 自定义角色 Tab */}
              {activeTab === 'custom' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      项目专属角色，可自定义创建
                    </span>
                    {canManageRoles && (
                      <Button icon={Plus} onClick={handleCreateRole} data-tour="create-role-btn">
                        新建角色
                      </Button>
                    )}
                  </div>
                  {customRoles.length === 0 ? (
                    <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                      <Users
                        size={32}
                        className="mx-auto mb-2"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <p>暂无自定义角色</p>
                      {canManageRoles && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          点击&ldquo;新建角色&rdquo;创建项目专属角色
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {customRoles.map((role) => (
                        <div
                          key={role.id}
                          className="p-4 bg-white rounded-lg border-2 border-emerald-200 hover:border-emerald-300 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {getRoleDisplayName(role.name)}
                              </h4>
                              {role.description && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                  <DescriptionText>
                                    {role.description}
                                  </DescriptionText>
                                </p>
                              )}
                            </div>
                            {canManageRoles && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditRole(role)}
                                >
                                  <Edit size={16} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteRole(role)}
                                >
                                  <Trash2 size={16} className="text-red-500" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* 系统角色 Tab */}
              {activeTab === 'system' && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      所有项目共享使用，不可删除
                    </span>
                  </div>
                  {systemRoles.length === 0 ? (
                    <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                      <Shield
                        size={32}
                        className="mx-auto mb-2"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <p>暂无系统角色</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {systemRoles.map((role) => (
                        <div
                          key={role.id}
                          className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                  {getRoleDisplayName(role.name)}
                                </h4>
                                <Tag variant="primary" className="flex-shrink-0">
                                  系统
                                </Tag>
                              </div>
                              {role.description && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                  <DescriptionText>
                                    {role.description}
                                  </DescriptionText>
                                </p>
                              )}
                            </div>
                            {canManageRoles && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRole(role)}
                                className="flex-shrink-0"
                              >
                                <Edit size={16} />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 权限配置弹窗 */}
      <PermissionConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={editingRole ? '配置项目角色权限' : '新建项目角色'}
        roleName={roleName}
        roleDesc={roleDesc}
        onNameChange={setRoleName}
        onDescChange={setRoleDesc}
        permissions={selectedPerms}
        onPermissionsChange={setSelectedPerms}
        onSave={handleSaveRole}
        isSystemRole={editingRole?.isSystem || false}
        isEditingSystemRole={!!editingRole && editingRole.isSystem}
        permissionType="project"
        loading={saving}
      />

      {/* 删除确认弹窗 */}
      {deleteConfirmOpen && roleToDelete && (
        <Modal
          isOpen={deleteConfirmOpen}
          onClose={() => {
            setDeleteConfirmOpen(false);
            setRoleToDelete(null);
          }}
          title="确认删除"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setRoleToDelete(null);
                }}
              >
                取消
              </Button>
              <Button
                onClick={confirmDeleteRole}
                className="bg-red-600 hover:bg-red-700"
              >
                确认删除
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg" style={{ background: 'var(--warning-light)', border: '1px solid var(--border-warning)' }}>
              <AlertCircle
                size={20}
                className="flex-shrink-0 mt-0.5"
                style={{ color: 'var(--warning)' }}
              />
              <div style={{ color: 'var(--warning-dark)' }}>
                <p className="font-semibold mb-1">重要提示</p>
                <p style={{ color: 'var(--warning-dim)' }}>
                  删除角色后，拥有该角色的成员将需要重新分配角色。如果该角色正在被使用，删除操作将被拒绝。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>删除角色：</p>
              <div className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {getRoleDisplayName(roleToDelete.name)}
                </p>
                {roleToDelete.description && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {roleToDelete.description}
                  </p>
                )}
              </div>
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <p>• 该角色下的成员将被移除角色</p>
              <p>• 删除操作不可恢复</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ProjectRolesModal;