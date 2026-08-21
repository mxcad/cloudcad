import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from '../RoleManagement.module.css';
import { RoleCard } from './RoleCard';
import type { ProjectRoleTemplate } from '../types';

interface ProjectRolesSectionProps {
  roles: ProjectRoleTemplate[];
  loading: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canManagePermissions: boolean;
  onCreate: () => void;
  onEdit: (role: ProjectRoleTemplate) => void;
  onDelete: (id: string) => void;
}

/**
 * 项目角色模板区块（ADR-00XX）：系统管理员维护"创建项目时的默认角色"，
 * 模板只影响新建项目，存量项目持有自己的副本不受影响。
 */
export function ProjectRolesSection({
  roles,
  loading,
  canCreate,
  canDelete,
  canManagePermissions,
  onCreate,
  onEdit,
  onDelete,
}: ProjectRolesSectionProps) {
  return (
    <div className={styles.rolesSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{t('项目角色模板')}</h2>
          <p className={styles.sectionSubtitle}>
            {t('创建项目时的默认角色，不影响已有项目')}
          </p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={onCreate}
            loading={loading}
          >
            {t('新建模板')}
          </Button>
        )}
      </div>

      <div className={styles.rolesGrid} data-tour="project-role-templates">
        {roles.map((role, index) => (
          <RoleCard
            key={role.id}
            role={role}
            type="project"
            index={index}
            canDelete={canDelete}
            canManagePermissions={canManagePermissions}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
