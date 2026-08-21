import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { t } from '@/languages';
import styles from '../RoleManagement.module.css';
import { RoleCard } from './RoleCard';
import type { SystemRole } from '../types';

interface SystemRolesSectionProps {
  roles: SystemRole[];
  loading: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canManagePermissions: boolean;
  onCreate: () => void;
  onEdit: (role: SystemRole) => void;
  onDelete: (id: string) => void;
}

export function SystemRolesSection({
  roles,
  loading,
  canCreate,
  canDelete,
  canManagePermissions,
  onCreate,
  onEdit,
  onDelete,
}: SystemRolesSectionProps) {
  return (
    <div className={styles.rolesSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{t('系统角色')}</h2>
          <p className={styles.sectionSubtitle}>
            {t('管理系统用户的角色和权限，系统默认角色不可删除')}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={onCreate}
            disabled={loading}
            data-tour="create-role-btn"
          >
            <Plus size={18} />
            {t('新建角色')}
          </Button>
        )}
      </div>

      <div className={styles.rolesGrid}>
        {roles.map((role, index) => (
          <RoleCard
            key={role.id}
            role={role}
            type="system"
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
