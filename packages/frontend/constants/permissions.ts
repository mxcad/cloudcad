/**
 * 权限常量 - 自动生成，请勿手动修改
 *
 * 生成时间: 2026-02-11T10:09:09.401Z
 * 来源: Prisma Schema (packages/backend/prisma/schema.prisma)
 *
 * 如需修改权限，请编辑 packages/backend/prisma/schema.prisma 文件，
 * 然后运行 pnpm generate:frontend-permissions 重新生成
 *
 * 注意：权限格式为大写下划线（如 'PROJECT_CREATE'），与后端枚举和数据库保持一致
 */

/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export const SystemPermission = {
  SYSTEM_USER_READ: 'SYSTEM_USER_READ',
  SYSTEM_USER_CREATE: 'SYSTEM_USER_CREATE',
  SYSTEM_USER_UPDATE: 'SYSTEM_USER_UPDATE',
  SYSTEM_USER_DELETE: 'SYSTEM_USER_DELETE',
  SYSTEM_ROLE_READ: 'SYSTEM_ROLE_READ',
  SYSTEM_ROLE_CREATE: 'SYSTEM_ROLE_CREATE',
  SYSTEM_ROLE_UPDATE: 'SYSTEM_ROLE_UPDATE',
  SYSTEM_ROLE_DELETE: 'SYSTEM_ROLE_DELETE',
  SYSTEM_ROLE_PERMISSION_MANAGE: 'SYSTEM_ROLE_PERMISSION_MANAGE',
  SYSTEM_FONT_READ: 'SYSTEM_FONT_READ',
  SYSTEM_FONT_UPLOAD: 'SYSTEM_FONT_UPLOAD',
  SYSTEM_FONT_DELETE: 'SYSTEM_FONT_DELETE',
  SYSTEM_FONT_DOWNLOAD: 'SYSTEM_FONT_DOWNLOAD',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  SYSTEM_MONITOR: 'SYSTEM_MONITOR',
} as const;

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 */
export const ProjectPermission = {
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_MEMBER_MANAGE: 'PROJECT_MEMBER_MANAGE',
  PROJECT_MEMBER_ASSIGN: 'PROJECT_MEMBER_ASSIGN',
  PROJECT_TRANSFER: 'PROJECT_TRANSFER',
  PROJECT_ROLE_MANAGE: 'PROJECT_ROLE_MANAGE',
  PROJECT_ROLE_PERMISSION_MANAGE: 'PROJECT_ROLE_PERMISSION_MANAGE',
  FILE_CREATE: 'FILE_CREATE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_OPEN: 'FILE_OPEN',
  FILE_EDIT: 'FILE_EDIT',
  FILE_DELETE: 'FILE_DELETE',
  FILE_TRASH_MANAGE: 'FILE_TRASH_MANAGE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  CAD_SAVE: 'CAD_SAVE',
  CAD_EXPORT: 'CAD_EXPORT',
  CAD_EXTERNAL_REFERENCE: 'CAD_EXTERNAL_REFERENCE',
  GALLERY_ADD: 'GALLERY_ADD',
  VERSION_READ: 'VERSION_READ',
} as const;

/**
 * 系统权限类型
 */
export type SystemPermission = typeof SystemPermission[keyof typeof SystemPermission];

/**
 * 项目权限类型
 */
export type ProjectPermission = typeof ProjectPermission[keyof typeof ProjectPermission];

/**
 * 统一权限类型
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 获取系统权限的所有值
 */
export const SystemPermissionValues = Object.values(SystemPermission) as readonly SystemPermission[];

/**
 * 获取项目权限的所有值
 */
export const ProjectPermissionValues = Object.values(ProjectPermission) as readonly ProjectPermission[];

/**
 * 获取所有权限的值
 */
export const PermissionValues = [...SystemPermissionValues, ...ProjectPermissionValues] as readonly Permission[];

/**
 * 权限依赖关系
 * 记录每个权限需要依赖的其他权限
 */
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  'SYSTEM_USER_UPDATE': ["SYSTEM_USER_READ"],
  'SYSTEM_USER_DELETE': ["SYSTEM_USER_READ"],
  'SYSTEM_ROLE_UPDATE': ["SYSTEM_ROLE_READ"],
  'SYSTEM_ROLE_DELETE': ["SYSTEM_ROLE_READ"],
  'SYSTEM_FONT_UPLOAD': ["SYSTEM_FONT_READ"],
  'SYSTEM_FONT_DELETE': ["SYSTEM_FONT_READ"],
  'SYSTEM_FONT_DOWNLOAD': ["SYSTEM_FONT_READ"],
  'PROJECT_UPDATE': ["FILE_OPEN"],
  'PROJECT_DELETE': ["PROJECT_UPDATE"],
  'PROJECT_MEMBER_MANAGE': ["PROJECT_UPDATE"],
  'PROJECT_MEMBER_ASSIGN': ["PROJECT_UPDATE"],
  'PROJECT_TRANSFER': ["PROJECT_UPDATE"],
  'FILE_EDIT': ["FILE_OPEN"],
  'FILE_DELETE': ["FILE_OPEN"],
  'FILE_TRASH_MANAGE': ["FILE_OPEN"],
  'FILE_DOWNLOAD': ["FILE_OPEN"],
  'CAD_SAVE': ["FILE_OPEN"],
  'CAD_EXPORT': ["FILE_OPEN"],
  'CAD_EXTERNAL_REFERENCE': ["FILE_OPEN"],
  'GALLERY_ADD': ["FILE_OPEN"],
  'VERSION_READ': ["FILE_OPEN"],
};

/**
 * 权限分组定义
 */
export const PERMISSION_GROUPS = {
  system: [
    {
      label: '用户权限',
      items: [
        { key: 'SYSTEM_USER_READ', label: '查看用户' },
        { key: 'SYSTEM_USER_CREATE', label: '创建用户' },
        { key: 'SYSTEM_USER_UPDATE', label: '编辑用户' },
        { key: 'SYSTEM_USER_DELETE', label: '删除用户' },
      ],
    },
    {
      label: '角色权限管理',
      items: [
        { key: 'SYSTEM_ROLE_READ', label: '查看角色' },
        { key: 'SYSTEM_ROLE_CREATE', label: '创建角色' },
        { key: 'SYSTEM_ROLE_UPDATE', label: '编辑角色' },
        { key: 'SYSTEM_ROLE_DELETE', label: '删除角色' },
        { key: 'SYSTEM_ROLE_PERMISSION_MANAGE', label: '角色权限管理' },
      ],
    },
    {
      label: '字体管理',
      items: [
        { key: 'SYSTEM_FONT_READ', label: '查看字体' },
        { key: 'SYSTEM_FONT_UPLOAD', label: '上传字体' },
        { key: 'SYSTEM_FONT_DELETE', label: '删除字体' },
        { key: 'SYSTEM_FONT_DOWNLOAD', label: '下载字体' },
      ],
    },
    {
      label: '系统权限',
      items: [
        { key: 'SYSTEM_ADMIN', label: '系统管理' },
        { key: 'SYSTEM_MONITOR', label: '系统监控' },
      ],
    },
  ],
  project: [
    {
      label: '项目权限',
      items: [
        { key: 'PROJECT_UPDATE', label: '编辑项目' },
        { key: 'PROJECT_DELETE', label: '删除项目' },
        { key: 'PROJECT_MEMBER_MANAGE', label: '成员管理' },
        { key: 'PROJECT_MEMBER_ASSIGN', label: '成员分配' },
        { key: 'PROJECT_TRANSFER', label: '转让所有权' },
        { key: 'PROJECT_ROLE_MANAGE', label: '角色管理' },
        { key: 'PROJECT_ROLE_PERMISSION_MANAGE', label: '角色权限配置' },
      ],
    },
    {
      label: '文件权限',
      items: [
        { key: 'FILE_CREATE', label: '创建文件' },
        { key: 'FILE_UPLOAD', label: '上传文件' },
        { key: 'FILE_OPEN', label: '查看文件' },
        { key: 'FILE_EDIT', label: '编辑文件' },
        { key: 'FILE_DELETE', label: '删除文件' },
        { key: 'FILE_TRASH_MANAGE', label: '回收站管理' },
        { key: 'FILE_DOWNLOAD', label: '下载文件' },
      ],
    },
    {
      label: 'CAD 图纸权限',
      items: [
        { key: 'CAD_SAVE', label: '保存图纸' },
        { key: 'CAD_EXPORT', label: '导出图纸' },
        { key: 'CAD_EXTERNAL_REFERENCE', label: '管理外部参照' },
      ],
    },
    {
      label: '图库权限',
      items: [
        { key: 'GALLERY_ADD', label: '添加到图库' },
      ],
    },
    {
      label: '版本管理',
      items: [
        { key: 'VERSION_READ', label: '查看版本' },
      ],
    },
  ],

} as const;

/**
 * 权限分组项类型
 */
export type PermissionGroupItem = {
  key: Permission;
  label: string;
};

/**
 * 权限分组类型
 */
export type PermissionGroup = {
  label: string;
  items: PermissionGroupItem[];
};

/**
 * 检查权限是否满足依赖条件
 */
export const isPermissionEnabled = (perm: string, selected: string[]): boolean => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies || dependencies.length === 0) return true;

  return dependencies.every((dep) => selected.includes(dep));
};

/**
 * 获取权限缺失的依赖
 */
export const getMissingDependencies = (perm: string, selected: string[]): string[] => {
  const dependencies = PERMISSION_DEPENDENCIES[perm];
  if (!dependencies || dependencies.length === 0) return [];

  return dependencies.filter((dep) => !selected.includes(dep));
};

/**
 * 切换权限选中状态
 */
export const togglePermission = (
  perm: string,
  selected: string[],
  setSelected: (perms: string[]) => void
): void => {
  if (selected.includes(perm)) {
    setSelected(selected.filter((p) => p !== perm));
  } else {
    setSelected([...selected, perm]);
  }
};

/**
 * 系统角色名称映射
 */
export const SYSTEM_ROLE_NAMES: Record<string, string> = {
  ADMIN: '系统管理员',
  USER_MANAGER: '用户管理员',
  FONT_MANAGER: '字体管理员',
  USER: '普通用户',
};

/**
 * 项目角色名称映射
 */
export const PROJECT_ROLE_NAMES: Record<string, string> = {
  PROJECT_OWNER: '项目所有者',
  PROJECT_ADMIN: '项目管理员',
  PROJECT_EDITOR: '项目编辑者',
  PROJECT_MEMBER: '项目成员',
  PROJECT_VIEWER: '项目查看者',
};

/**
 * 获取角色显示名称
 */
export const getRoleDisplayName = (roleName: string, isSystemRole: boolean): string => {
  // 根据角色名称前缀判断是否为项目角色
  const isProjectRole = roleName.startsWith('PROJECT_');
  const mapping = isProjectRole ? PROJECT_ROLE_NAMES : SYSTEM_ROLE_NAMES;
  return mapping[roleName] || roleName;
};
