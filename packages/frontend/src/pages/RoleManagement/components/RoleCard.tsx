import { Trash2 } from 'lucide-react';
import { Button, Tag } from '@/components/ui';
import { t } from '@/languages';
import { PERMISSION_GROUPS, getRoleDisplayName } from '@/constants/permissions';
import styles from '../RoleManagement.module.css';
import type { SystemRole, ProjectRoleTemplate, RoleType } from '../types';

interface RoleCardProps<T extends SystemRole | ProjectRoleTemplate> {
  role: T;
  type: RoleType;
  index: number;
  canDelete: boolean;
  canManagePermissions: boolean;
  onDelete: (id: string) => void;
  onEdit: (role: T) => void;
}

function renderPermissionTags(permissions: string[], type: RoleType) {
  const groups = PERMISSION_GROUPS[type];
  const allPerms = groups.flatMap((g) => g.items);

  return permissions.slice(0, 6).map((p) => {
    const permKey =
      typeof p === 'string'
        ? p
        : (p as { permission?: string })?.permission || '';
    const permItem = allPerms.find((item) => item.key === permKey);
    const label = permItem
      ? permItem.label
      : permKey.split('_').slice(1).join('_');

    return (
      <span key={permKey} className={styles.permissionTag}>
        {label}
      </span>
    );
  });
}

export function RoleCard<T extends SystemRole | ProjectRoleTemplate>({
  role,
  type,
  index,
  canDelete,
  canManagePermissions,
  onDelete,
  onEdit,
}: RoleCardProps<T>) {
  // 项目角色/模板：除 PROJECT_OWNER（项目所有者保护 / 模板保底）外可删；
  // 系统角色：仅自定义角色可删（系统角色由后端禁删）
  const canShowDelete =
    type === 'project'
      ? canDelete && role.name !== 'PROJECT_OWNER'
      : canDelete && !role.isSystem;

  return (
    <div
      className={`${styles.roleCard} ${role.isSystem ? styles.systemRole : styles.customRole}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className={styles.roleCardHeader}>
        <div className={styles.roleInfo}>
          <h3 className={styles.roleName}>
            {getRoleDisplayName(role.name, role.isSystem)}
            {role.isSystem && (
              <Tag variant="primary" size="xs">
                {t('系统')}
              </Tag>
            )}
          </h3>
          <p className={styles.roleDescription}>
            {role.description ? t(role.description) : t('暂无描述')}
          </p>
        </div>
        {canShowDelete && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => onDelete(role.id)}
            className={styles.deleteBtn}
            title={t('删除角色')}
            icon={Trash2}
          />
        )}
      </div>

      <div className={styles.rolePermissions}>
        <h4 className={styles.permissionsTitle}>{t('拥有权限')}</h4>
        <div className={styles.permissionsList}>
          {renderPermissionTags(role.permissions, type)}
          {role.permissions.length > 6 && (
            <span className={styles.moreTag}>
              +{role.permissions.length - 6}
            </span>
          )}
        </div>
      </div>

      {canManagePermissions && (
        <div className={styles.roleCardFooter}>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onEdit(role)}
          >
            {t('配置权限')}
          </Button>
        </div>
      )}
    </div>
  );
}
