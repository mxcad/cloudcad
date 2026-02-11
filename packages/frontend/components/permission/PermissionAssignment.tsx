import React from 'react';
import { Check, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  PERMISSION_GROUPS,
  isPermissionEnabled,
  getMissingDependencies,
  togglePermission,
} from '../../constants/permissions';

/**
 * 权限配置组件属性
 */
export interface PermissionAssignmentProps {
  /** 当前选中的权限列表 */
  permissions: string[];
  /** 权限变更回调 */
  onPermissionsChange: (perms: string[]) => void;
  /** 权限类型：system 或 project */
  permissionType: 'system' | 'project';
  /** 是否禁用权限选择 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 权限分配组件
 *
 * 用于展示和管理角色权限的分配，支持权限依赖检查和可视化提示
 *
 * @example
 * ```tsx
 * <PermissionAssignment
 *   permissions={selectedPerms}
 *   onPermissionsChange={setSelectedPerms}
 *   permissionType="project"
 * />
 * ```
 */
export const PermissionAssignment: React.FC<PermissionAssignmentProps> = ({
  permissions,
  onPermissionsChange,
  permissionType,
  disabled = false,
  className = '',
}) => {
  // 调试信息
  console.log('[PermissionAssignment] 组件渲染:', { permissionType, PERMISSION_GROUPS, allKeys: Object.keys(PERMISSION_GROUPS) });

  const groups = PERMISSION_GROUPS[permissionType];

  // 防御性检查：如果 groups 为 undefined，显示错误信息
  if (!groups) {
    console.error('[PermissionAssignment] 无效的 permissionType:', permissionType);
    console.error('[PermissionAssignment] PERMISSION_GROUPS:', PERMISSION_GROUPS);
    console.error('[PermissionAssignment] PERMISSION_GROUPS.keys:', Object.keys(PERMISSION_GROUPS));
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        权限类型错误: {permissionType}。请检查配置。
      </div>
    );
  }

  const allPermissions = groups.flatMap((group) => group.items);

  return (
    <div className={`space-y-4 max-h-[600px] overflow-y-auto pr-2 ${className}`}>
      {groups.map((group) => (
        <div
          key={group.label}
          className="border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase sticky top-0">
            {group.label}
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {group.items.map((perm) => {
              const isEnabled = isPermissionEnabled(perm.key, permissions) && !disabled;
              const missingDeps = getMissingDependencies(perm.key, permissions);

              return (
                <label
                  key={perm.key}
                  className={`flex items-center gap-2 p-2 rounded transition-colors ${
                    isEnabled
                      ? 'hover:bg-slate-50 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                  title={
                    !isEnabled && missingDeps.length > 0
                      ? `⚠️ 此权限需要先勾选：${missingDeps
                          .map((dep) => {
                            const depItem = allPermissions.find((i) => i.key === dep);
                            return depItem ? depItem.label : dep;
                          })
                          .join('、')}`
                      : perm.label
                  }
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      permissions.includes(perm.key)
                        ? 'bg-indigo-600 border-indigo-600'
                        : isEnabled
                          ? 'border-slate-300 bg-white'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {permissions.includes(perm.key) && (
                      <Check size={12} className="text-white" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={permissions.includes(perm.key)}
                    onChange={() =>
                      isEnabled &&
                      togglePermission(perm.key, permissions, onPermissionsChange)
                    }
                    disabled={!isEnabled}
                  />
                  <span className="text-sm text-slate-700 truncate">{perm.label}</span>
                  {!isEnabled && missingDeps.length > 0 && (
                    <Info size={14} className="text-amber-500 flex-shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 权限配置弹窗组件属性
 */
export interface PermissionConfigModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 弹窗标题 */
  title: string;
  /** 角色名称 */
  roleName: string;
  /** 角色描述 */
  roleDesc: string;
  /** 角色名称变更回调 */
  onNameChange: (value: string) => void;
  /** 角色描述变更回调 */
  onDescChange: (value: string) => void;
  /** 当前选中的权限列表 */
  permissions: string[];
  /** 权限变更回调 */
  onPermissionsChange: (perms: string[]) => void;
  /** 保存回调 */
  onSave: () => void;
  /** 是否为系统角色 */
  isSystemRole: boolean;
  /** 是否正在编辑系统角色 */
  isEditingSystemRole: boolean;
  /** 权限类型：system 或 project */
  permissionType: 'system' | 'project';
  /** 是否正在保存 */
  loading?: boolean;
}

/**
 * 权限配置弹窗组件
 *
 * 用于配置角色的基本信息和权限分配
 *
 * @example
 * ```tsx
 * <PermissionConfigModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   title="配置角色权限"
 *   roleName={roleName}
 *   roleDesc={roleDesc}
 *   onNameChange={setRoleName}
 *   onDescChange={setRoleDesc}
 *   permissions={selectedPerms}
 *   onPermissionsChange={setSelectedPerms}
 *   onSave={handleSave}
 *   isSystemRole={isSystem}
 *   isEditingSystemRole={isEditing}
 *   permissionType="project"
 * />
 * ```
 */
export const PermissionConfigModal: React.FC<PermissionConfigModalProps> = ({
  isOpen,
  onClose,
  title,
  roleName,
  roleDesc,
  onNameChange,
  onDescChange,
  permissions,
  onPermissionsChange,
  onSave,
  isSystemRole,
  isEditingSystemRole,
  permissionType,
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={onSave} disabled={loading}>
            {loading ? '保存中...' : '保存配置'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            基本信息
          </label>
          <input
            type="text"
            placeholder="角色名称"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
            value={roleName}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={isSystemRole && isEditingSystemRole}
          />
          <input
            type="text"
            placeholder="描述"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
            value={roleDesc}
            onChange={(e) => onDescChange(e.target.value)}
            disabled={isSystemRole && isEditingSystemRole}
          />
          {isSystemRole && isEditingSystemRole && (
            <p className="text-xs text-amber-600">
              系统角色不允许修改名称和描述，但可以修改权限
            </p>
          )}
        </div>

        {/* 权限分配 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            权限分配
          </label>
          <PermissionAssignment
            permissions={permissions}
            onPermissionsChange={onPermissionsChange}
            permissionType={permissionType}
          />
        </div>
      </div>
    </Modal>
  );
};

export default PermissionAssignment;