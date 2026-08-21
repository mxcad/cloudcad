import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { SystemPermission } from '../../constants/permissions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { t } from '@/languages';
import { PermissionConfigModal } from '../../components/permission/PermissionAssignment';
import styles from './RoleManagement.module.css';
import { useRoleData } from './hooks/useRoleData';
import { useRoleFeedback } from './hooks/useRoleFeedback';
import { useSystemRoleCrud } from './hooks/useSystemRoleCrud';
import { useProjectRoleTemplates } from './hooks/useProjectRoleTemplates';
import { useRoleDelete } from './hooks/useRoleDelete';
import { RoleHeader } from './components/RoleHeader';
import { SystemRolesSection } from './components/SystemRolesSection';
import { ProjectRolesSection } from './components/ProjectRolesSection';
import { DeleteRoleModal } from './components/DeleteRoleModal';
import { ErrorModal } from './components/ErrorModal';

export const RoleManagement = () => {
  useDocumentTitle(t('角色权限'));
  const { hasPermission } = usePermission();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const loadingControl = { loading, setLoading };
  const feedback = useRoleFeedback();
  const {
    systemRoles,
    projectRoleTemplates,
    initialize,
    loadSystemRoles,
    loadProjectRoleTemplates,
  } = useRoleData(loadingControl);
  const deleteCtl = useRoleDelete({
    load: loadSystemRoles,
    feedback,
    loadingControl,
  });
  const systemCrud = useSystemRoleCrud({
    load: loadSystemRoles,
    feedback,
    onRequestDelete: (id) => deleteCtl.openDelete(id),
    loadingControl,
  });
  const templateCrud = useProjectRoleTemplates({
    load: loadProjectRoleTemplates,
    feedback,
    loadingControl,
  });

  const filteredSystemRoles = systemRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description &&
        role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredTemplates = projectRoleTemplates.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (role.description &&
        role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const canReadSystemRoles = hasPermission(SystemPermission.SYSTEM_ROLE_READ);
  const canCreateRoles = hasPermission(SystemPermission.SYSTEM_ROLE_CREATE);
  const canDeleteRoles = hasPermission(SystemPermission.SYSTEM_ROLE_DELETE);
  const canManagePermissions = hasPermission(
    SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE
  );

  if (!canReadSystemRoles) {
    return (
      <div className={styles.roleManagementContainer}>
        <div className={styles.accessDeniedState}>
          <div className={styles.accessDeniedIcon}>
            <AlertCircle size={48} />
          </div>
          <h2 className={styles.accessDeniedTitle}>{t('访问被拒绝')}</h2>
          <p className={styles.accessDeniedText}>
            {t('您没有权限访问此页面。')}
          </p>
          <p className={styles.accessDeniedHint}>
            {t('请联系管理员获取角色管理权限。')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.roleManagementContainer}>
      {feedback.successMessage && (
        <div className={styles.successToast}>
          <CheckCircle2 size={18} />
          <span>{feedback.successMessage}</span>
        </div>
      )}

      <RoleHeader
        searchQuery={searchQuery}
        loading={loading}
        onSearchChange={setSearchQuery}
        onRefresh={initialize}
      />

      <SystemRolesSection
        roles={filteredSystemRoles}
        loading={loading}
        canCreate={canCreateRoles}
        canDelete={canDeleteRoles}
        canManagePermissions={canManagePermissions}
        onCreate={systemCrud.handleCreateSystemRole}
        onEdit={systemCrud.handleEditSystemRole}
        onDelete={systemCrud.handleDeleteSystemRole}
      />

      <ProjectRolesSection
        roles={filteredTemplates}
        loading={loading}
        canCreate={canCreateRoles}
        canDelete={canDeleteRoles}
        canManagePermissions={canManagePermissions}
        onCreate={templateCrud.handleCreateTemplate}
        onEdit={templateCrud.handleEditTemplate}
        onDelete={templateCrud.handleRequestDelete}
      />

      <PermissionConfigModal
        isOpen={systemCrud.systemModalOpen}
        onClose={() => systemCrud.setSystemModalOpen(false)}
        title={
          systemCrud.editingSystemRole
            ? t('配置系统角色权限')
            : t('新建系统角色')
        }
        roleName={systemCrud.systemRoleName}
        roleDesc={systemCrud.systemRoleDesc}
        onNameChange={systemCrud.setSystemRoleName}
        onDescChange={systemCrud.setSystemRoleDesc}
        permissions={systemCrud.selectedSystemPerms}
        onPermissionsChange={systemCrud.setSelectedSystemPerms}
        onSave={systemCrud.handleSaveSystemRole}
        isSystemRole={systemCrud.editingSystemRole?.isSystem || false}
        isEditingSystemRole={
          !!systemCrud.editingSystemRole &&
          systemCrud.editingSystemRole.isSystem
        }
        permissionType="system"
        loading={loading}
      />

      <PermissionConfigModal
        isOpen={templateCrud.modalOpen}
        onClose={() => templateCrud.setModalOpen(false)}
        title={
          templateCrud.editingTemplate
            ? t('配置项目角色模板')
            : t('新建项目角色模板')
        }
        roleName={templateCrud.templateName}
        roleDesc={templateCrud.templateDesc}
        onNameChange={templateCrud.setTemplateName}
        onDescChange={templateCrud.setTemplateDesc}
        permissions={templateCrud.selectedPerms}
        onPermissionsChange={templateCrud.setSelectedPerms}
        onSave={templateCrud.handleSaveTemplate}
        isSystemRole
        isEditingSystemRole={!!templateCrud.editingTemplate}
        lockDescription={false}
        permissionType="project"
        loading={loading}
      />

      <DeleteRoleModal
        isOpen={deleteCtl.deleteConfirmOpen}
        loading={loading}
        onClose={deleteCtl.closeDelete}
        onConfirm={deleteCtl.confirmDelete}
      />

      <DeleteRoleModal
        isOpen={!!templateCrud.deleteId}
        loading={loading}
        onClose={templateCrud.closeDelete}
        onConfirm={templateCrud.handleConfirmDelete}
      />

      <ErrorModal
        isOpen={feedback.errorModalOpen}
        message={feedback.errorModalMessage}
        onClose={feedback.closeErrorModal}
      />
    </div>
  );
};

export default RoleManagement;
