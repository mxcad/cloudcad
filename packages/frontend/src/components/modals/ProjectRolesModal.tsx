import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Settings,
  Users,
  Edit,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';
import { Modal } from '../ui/Modal';
import { DescriptionText } from '../ui/TruncateText';
import { PermissionConfigModal } from '../permission/PermissionAssignment';
import { useProjectRoleCRUD } from './hooks/useProjectRoleCRUD';
import { usePermission } from '../../hooks/usePermission';
import { useProjectPermissions } from '../../hooks/useProjectPermissions';
import { useNotification } from '../../contexts/NotificationContext';
import {
  getProjectRoleNames,
  ProjectPermission,
} from '../../constants/permissions';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import type { ProjectRoleDto } from '@/api-sdk';

interface ProjectRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

/**
 * 项目角色管理弹窗（ADR-00XX 项目自治）：
 * 项目创建时从模板复制默认角色副本，项目内所有角色（含默认角色）完全自治——
 * 可编辑（改名/改权限/改描述）、可删除（项目所有者使用的角色除外，数据驱动 isOwnerRole）。
 * 角色删除时，使用该角色的成员自动降级为项目成员（PROJECT_MEMBER）。
 */
export const ProjectRolesModal: React.FC<ProjectRolesModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const { check: checkProjectPermission } = useProjectPermissions(projectId, {
    permissions: [
      ProjectPermission.PROJECT_ROLE_MANAGE,
      ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
    ],
  });
  const { showToast } = useNotification();
  const {
    roles,
    loading,
    error: hookError,
    createRole,
    updateRole,
    deleteRole,
  } = useProjectRoleCRUD(projectId);

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

  // 项目角色管理：项目权限 PROJECT_ROLE_MANAGE（#262，项目所有者/管理员可管理）
  const canManageRoles = checkProjectPermission(
    ProjectPermission.PROJECT_ROLE_MANAGE
  );

  // 编辑角色：PATCH 支持 permissions 全量替换，需同时具备权限配置权限
  const canEditRoles =
    canManageRoles &&
    checkProjectPermission(ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE);

  // 创建角色
  const handleCreateRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setSelectedPerms([]);
    setConfigModalOpen(true);
  };

  // 编辑角色（项目内角色可改名/改描述/改权限，自治）
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
      showToast(t('请输入角色名称'), 'warning');
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
        showToast(t('角色更新成功'), 'success');
      } else {
        await createRole({
          name: roleName,
          description: roleDesc,
          permissions: selectedPerms,
        });
        showToast(t('角色创建成功'), 'success');
      }

      setConfigModalOpen(false);
    } catch (error) {
      console.error('保存角色失败:', error);
      // SDK 默认不抛错：mutationFn 抛出的 result.error 是后端 body 对象（带 message 字段），
      // 用 getErrorMessage 统一提取（.response?.data?.message 形状恒 undefined）
      showToast(getErrorMessage(error) || t('保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 删除角色：项目所有者使用的角色（isOwnerRole，数据驱动）不可删，后端兜底；
  // 删除后若项目不再存在可降级的非所有者角色（与后端 no_demote_target 兜底一致），
  // 直接以 toast 弹出提示，避免错误横幅写死在弹框内、重开弹框仍残留。
  const handleDeleteRole = (role: ProjectRoleDto) => {
    if (role.isOwnerRole) {
      showToast(t('项目所有者使用的角色不可删除'), 'warning');
      return;
    }
    const hasDemoteTarget = roles.some(
      (r) => !r.isOwnerRole && r.id !== role.id
    );
    if (!hasDemoteTarget) {
      showToast(t('项目至少需要保留一个可降级的非所有者角色'), 'warning');
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
      showToast(getErrorMessage(error) || t('删除失败'), 'error');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('项目角色管理')}
        className="max-w-4xl"
        footer={
          <Button
            variant="secondary"
            onClick={onClose}
            data-tour="modal-close-btn"
          >
            {t('关闭')}
          </Button>
        }
      >
        <div className="space-y-6">
          {/* 错误提示 */}
          {hookError && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ background: 'var(--bg-error)', color: 'var(--error)' }}
            >
              <AlertCircle size={16} />
              {hookError}
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">{t('加载中...')}</span>
            </div>
          )}

          {/* 角色列表（项目自治：默认角色 + 自定义角色统一管理） */}
          {!loading && (
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              <div className="flex items-center justify-between mb-4">
                <span
                  data-tour="project-role-hint"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                  }}
                >
                  {t(
                    '项目角色属于本项目，可自由编辑；删除角色时成员自动降级为项目成员'
                  )}
                </span>
                {canManageRoles && (
                  <Button
                    icon={Plus}
                    onClick={handleCreateRole}
                    data-tour="create-role-btn"
                  >
                    {t('新建角色')}
                  </Button>
                )}
              </div>
              {roles.length === 0 ? (
                <div
                  className="text-center py-8"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Users
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <p>{t('暂无项目角色')}</p>
                  {canManageRoles && (
                    <p
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.75rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      {t('点击\u201C新建角色\u201D创建项目专属角色')}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  data-tour="project-role-list"
                >
                  {roles.map((role) => {
                    const isDefault = role.isSystem;
                    return (
                      <div
                        key={role.id}
                        className={`p-4 rounded-lg border-2 transition-colors ${
                          isDefault
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-white border-emerald-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4
                                className="font-semibold truncate"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {getProjectRoleNames()[role.name] || role.name}
                              </h4>
                              {isDefault && (
                                <Tag
                                  variant="primary"
                                  className="flex-shrink-0"
                                >
                                  {t('默认')}
                                </Tag>
                              )}
                              {role.isOwnerRole && (
                                <Tag
                                  variant="neutral"
                                  className="flex-shrink-0"
                                >
                                  {t('项目所有者')}
                                </Tag>
                              )}
                            </div>
                            {role.description && (
                              <p
                                style={{
                                  color: 'var(--text-muted)',
                                  fontSize: '0.75rem',
                                  marginTop: '0.25rem',
                                }}
                              >
                                <DescriptionText>
                                  {t(role.description)}
                                </DescriptionText>
                              </p>
                            )}
                          </div>
                          {(canEditRoles || canManageRoles) && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {canEditRoles && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleEditRole(role)}
                                >
                                  <Edit size={16} />
                                </Button>
                              )}
                              {canManageRoles && !role.isOwnerRole && (
                                <Button
                                  variant="secondary"
                                  size="md"
                                  onClick={() => handleDeleteRole(role)}
                                >
                                  <Trash2 size={18} className="text-red-500" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 权限配置弹窗（项目内角色可改名/改描述，不锁定） */}
      <PermissionConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={editingRole ? t('配置项目角色权限') : t('新建项目角色')}
        roleName={roleName}
        roleDesc={roleDesc}
        onNameChange={setRoleName}
        onDescChange={setRoleDesc}
        permissions={selectedPerms}
        onPermissionsChange={setSelectedPerms}
        onSave={handleSaveRole}
        isSystemRole={false}
        isEditingSystemRole={false}
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
          title={t('确认删除')}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setRoleToDelete(null);
                }}
              >
                {t('取消')}
              </Button>
              <Button
                onClick={confirmDeleteRole}
                className="bg-red-600 hover:bg-red-700"
              >
                {t('确认删除')}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 p-4 rounded-lg"
              style={{
                background: 'var(--warning-light)',
                border: '1px solid var(--border-warning)',
              }}
            >
              <AlertCircle
                size={20}
                className="flex-shrink-0 mt-0.5"
                style={{ color: 'var(--warning)' }}
              />
              <div style={{ color: 'var(--text-primary)' }}>
                <p className="font-semibold mb-1">{t('重要提示')}</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {t(
                    '删除角色后，使用该角色的成员将自动降级为项目内的可用角色（优先项目成员）。'
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p
                className="font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('删除角色：')}
              </p>
              <div
                className="p-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <p
                  className="font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {getProjectRoleNames()[roleToDelete.name] ||
                    roleToDelete.name}
                </p>
                {roleToDelete.description && (
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    {roleToDelete.description}
                  </p>
                )}
              </div>
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <p>{t('• 该角色下的成员将自动降级为项目内角色')}</p>
              <p>{t('• 删除操作不可恢复')}</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ProjectRolesModal;
