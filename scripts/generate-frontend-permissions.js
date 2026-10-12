/**
 * 前端权限常量生成脚本
 *
 * 从 Prisma Schema 读取权限枚举定义，自动生成前端权限常量文件
 * 确保前后端权限定义保持一致
 *
 * 使用方法：
 *   pnpm generate:frontend-permissions
 */

const { readFileSync, writeFileSync } = require('fs');
const { join, dirname } = require('path');

/**
 * 从 Prisma Schema 中提取枚举值
 */
function extractEnumsFromSchema() {
  const schemaPath = join(
    __dirname,
    '../packages/db/prisma/schema.prisma'
  );
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  const enums = {};

  // 匹配 enum 定义
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];

    // 提取枚举值
    const values = enumBody
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//')) // 移除注释行和空行
      .map((line) => line.split('//')[0].trim()) // 移除行内注释
      .map((line) => line.replace(/,.?$/, '')) // 移除末尾逗号
      .filter((line) => line.length > 0);

    enums[enumName] = values;
  }

  return enums;
}

/**
 * 生成前端权限常量文件
 */
async function generateFrontendPermissions() {
  try {
    console.log('🚀 开始生成前端权限常量...');

    // 从 Prisma Schema 提取枚举
    const enums = extractEnumsFromSchema();

    // 获取系统权限和项目权限
    const systemPermissions = enums['Permission'] || [];
    const projectPermissions = enums['ProjectPermission'] || [];

    if (systemPermissions.length === 0 && projectPermissions.length === 0) {
      console.error('❌ 未找到权限枚举定义');
      process.exit(1);
    }

    // 生成系统权限常量
    const systemPermissionsObject = systemPermissions
      .map((value) => `  ${value}: '${value}',`)
      .join('\n');

    // 生成项目权限常量
    const projectPermissionsObject = projectPermissions
      .map((value) => `  ${value}: '${value}',`)
      .join('\n');

    // 生成系统权限依赖关系（项目部分来自 @cloudcad/platform，不在此生成）
    const systemPermissionDependencies = generateSystemPermissionDependencies(
      systemPermissions
    );

    // 生成权限分组
    const permissionGroups = generatePermissionGroups(
      systemPermissions,
      projectPermissions
    );

    // 生成文件内容
    const fileContent = `/**
 * 权限常量 - 自动生成，请勿手动修改
 *
 * 生成时间: ${new Date().toISOString()}
 * 来源: Prisma Schema (packages/db/prisma/schema.prisma)
 *
 * 如需修改权限，请编辑 packages/db/prisma/schema.prisma 文件，
 * 然后运行 pnpm generate:frontend-permissions 重新生成
 *
 * 注意：权限格式为大写下划线（如 'PROJECT_CREATE'），与后端枚举和数据库保持一致
 */

import { t } from '@/languages';
import {
  ProjectPermission,
  PROJECT_PERMISSION_DEPENDENCIES,
  completePermissionDependencies as completePermissionDependenciesCore,
  getDependentPermissions as getDependentPermissionsCore,
} from '@cloudcad/platform';

/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export const SystemPermission = {
${systemPermissionsObject}
} as const;

/**
 * 项目权限枚举（来自 @cloudcad/platform 跨端单一事实源，与移动端共用，
 * 由本脚本从 Prisma schema 派生到 platform 包）
 */
export { ProjectPermission };
export type ProjectPermissionValue =
  (typeof ProjectPermission)[keyof typeof ProjectPermission];
export type ProjectPermission = ProjectPermissionValue;

/**
 * 系统权限类型
 */
export type SystemPermission = typeof SystemPermission[keyof typeof SystemPermission];

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
 * 系统权限依赖关系（项目部分来自 @cloudcad/platform，见 PERMISSION_DEPENDENCIES）
 */
const SYSTEM_PERMISSION_DEPENDENCIES: Record<string, string[]> = {
${systemPermissionDependencies}
};

/**
 * 权限依赖关系（系统 + 项目；项目部分来自 @cloudcad/platform 单一事实源）
 * 记录每个权限需要依赖的其他权限
 */
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  ...SYSTEM_PERMISSION_DEPENDENCIES,
  ...PROJECT_PERMISSION_DEPENDENCIES,
};

/**
 * 权限分组定义
 */
export const PERMISSION_GROUPS: Record<
  'system' | 'project',
  PermissionGroup[]
> = {
${permissionGroups}
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
    setSelected(completePermissionDependencies([...selected, perm]));
  }
};

/**
 * 自动补全权限的前置依赖（迭代直至稳定，幂等）。
 * 算法来自 @cloudcad/platform（跨端单一事实源），此处以全量依赖图调用。
 * 勾选"创建角色"会自动带上"查看角色"，保证界面上不会出现
 * "能创建但看不到"的无效权限组合
 */
export const completePermissionDependencies = (
  selected: string[]
): string[] => completePermissionDependenciesCore(PERMISSION_DEPENDENCIES, selected);

/**
 * 获取取消 perm 时会被级联取消的下游权限（selected 中直接或传递依赖 perm 的权限）。
 * 算法来自 @cloudcad/platform（跨端单一事实源），此处以全量依赖图调用。
 * 用于取消前置权限（如"查看角色"）时提示用户哪些已勾选的权限会一并取消
 */
export const getDependentPermissions = (
  perm: string,
  selected: string[]
): string[] => getDependentPermissionsCore(PERMISSION_DEPENDENCIES, perm, selected);

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

/**
 * @deprecated 请使用 PERMISSION_GROUPS 常量
 */
export const getPermissionGroups = () => {
  const result = [];
  for (const groupList of Object.values(PERMISSION_GROUPS)) {
    result.push(...groupList);
  }
  return result;
};

/** @deprecated 请使用 PROJECT_ROLE_NAMES 常量 */
export const getProjectRoleNames = () => PROJECT_ROLE_NAMES;

/** @deprecated 请使用 SYSTEM_ROLE_NAMES 常量 */
export const getSystemRoleNames = () => SYSTEM_ROLE_NAMES;
`;

    // 写入文件
    const outputPath = join(
      __dirname,
      '../packages/frontend/src/constants/permissions.ts'
    );
    writeFileSync(outputPath, fileContent, 'utf-8');

    console.log(`✅ 前端权限常量生成完成`);
    console.log(`📁 输出文件: ${outputPath}`);
    console.log(`📊 系统权限: ${systemPermissions.length} 个`);
    console.log(`📊 项目权限: ${projectPermissions.length} 个`);
    console.log(
      `📊 总计: ${systemPermissions.length + projectPermissions.length} 个`
    );
  } catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  }
}

/**
 * 生成系统权限依赖关系（项目权限依赖来自 @cloudcad/platform，不在此生成）
 */
function generateSystemPermissionDependencies(systemPermissions) {
  const dependencies = {};

  // 系统权限依赖
  // 规则与后端 packages/backend/src/common/constants/permission-dependencies.constants.ts 保持一致，修改时两处同步
  // 创建/编辑用户必须在用户管理页的"角色"下拉中选择角色（GET /roles 需要 SYSTEM_ROLE_READ）
  if (systemPermissions.includes('SYSTEM_USER_CREATE')) {
    dependencies['SYSTEM_USER_CREATE'] = [
      'SYSTEM_USER_READ',
      'SYSTEM_ROLE_READ',
    ];
  }
  if (systemPermissions.includes('SYSTEM_USER_UPDATE')) {
    dependencies['SYSTEM_USER_UPDATE'] = [
      'SYSTEM_USER_READ',
      'SYSTEM_ROLE_READ',
    ];
  }
  if (systemPermissions.includes('SYSTEM_USER_DELETE')) {
    dependencies['SYSTEM_USER_DELETE'] = ['SYSTEM_USER_READ'];
  }
  if (systemPermissions.includes('SYSTEM_USER_MEMBERSHIP_MANAGE')) {
    dependencies['SYSTEM_USER_MEMBERSHIP_MANAGE'] = ['SYSTEM_USER_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_CREATE')) {
    dependencies['SYSTEM_ROLE_CREATE'] = ['SYSTEM_ROLE_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_UPDATE')) {
    dependencies['SYSTEM_ROLE_UPDATE'] = ['SYSTEM_ROLE_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_DELETE')) {
    dependencies['SYSTEM_ROLE_DELETE'] = ['SYSTEM_ROLE_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_PERMISSION_MANAGE')) {
    dependencies['SYSTEM_ROLE_PERMISSION_MANAGE'] = ['SYSTEM_ROLE_READ'];
  }
  if (systemPermissions.includes('SYSTEM_BILLING_WRITE')) {
    dependencies['SYSTEM_BILLING_WRITE'] = ['SYSTEM_BILLING_READ'];
  }
  if (systemPermissions.includes('SYSTEM_CONFIG_WRITE')) {
    dependencies['SYSTEM_CONFIG_WRITE'] = ['SYSTEM_CONFIG_READ'];
  }
  if (systemPermissions.includes('SYSTEM_FONT_UPLOAD')) {
    dependencies['SYSTEM_FONT_UPLOAD'] = ['SYSTEM_FONT_READ'];
  }
  if (systemPermissions.includes('SYSTEM_FONT_DELETE')) {
    dependencies['SYSTEM_FONT_DELETE'] = ['SYSTEM_FONT_READ'];
  }
  if (systemPermissions.includes('SYSTEM_FONT_DOWNLOAD')) {
    dependencies['SYSTEM_FONT_DOWNLOAD'] = ['SYSTEM_FONT_READ'];
  }

  return Object.entries(dependencies)
    .map(([key, value]) => `  '${key}': ${JSON.stringify(value)},`)
    .join('\n');
}

/**
 * 生成权限分组
 */
function generatePermissionGroups(systemPermissions, projectPermissions) {
  let result = '';

  // 系统权限分组
  result += '  system: [\n';
  result += generateSystemPermissionGroups(systemPermissions);
  result += '  ],\n';

  // 项目权限分组
  result += '  project: [\n';
  result += generateProjectPermissionGroups(projectPermissions);
  result += '  ],\n';

  return result;
}

/**
 * 生成系统权限分组
 */
function generateSystemPermissionGroups(permissions) {
  const groups = {
    用户权限: [],
    角色权限管理: [],
    字体管理: [],
    系统权限: [],
    公共资源库: [],
    项目管理: [],
  };

  permissions.forEach((perm) => {
    if (perm.startsWith('SYSTEM_USER')) {
      groups['用户权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('SYSTEM_ROLE')) {
      groups['角色权限管理'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('SYSTEM_FONT')) {
      groups['字体管理'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('LIBRARY_')) {
      groups['公共资源库'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm === 'PROJECT_CREATE') {
      groups['项目管理'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('SYSTEM_')) {
      groups['系统权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    }
  });

  let result = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (items.length > 0) {
      result += `    {\n      label: t('${label}'),\n      items: [\n`;
      items.forEach((item) => {
        result += `        { key: '${item.key}', label: t('${item.label}') },\n`;
      });
      result += '      ],\n    },\n';
    }
  });

  return result;
}

/**
 * 生成项目权限分组
 */
function generateProjectPermissionGroups(permissions) {
  const groups = {
    项目权限: [],
    文件权限: [],
    'CAD 图纸权限': [],
    图库权限: [],
    版本管理: [],
  };

  permissions.forEach((perm) => {
    if (perm.startsWith('PROJECT_')) {
      groups['项目权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('FILE_')) {
      groups['文件权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('CAD_')) {
      groups['CAD 图纸权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('GALLERY_')) {
      groups['图库权限'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    } else if (perm.startsWith('VERSION_')) {
      groups['版本管理'].push({
        key: perm,
        label: getPermissionLabel(perm),
      });
    }
  });

  let result = '';
  Object.entries(groups).forEach(([label, items]) => {
    if (items.length > 0) {
      result += `    {\n      label: t('${label}'),\n      items: [\n`;
      items.forEach((item) => {
        result += `        { key: '${item.key}', label: t('${item.label}') },\n`;
      });
      result += '      ],\n    },\n';
    }
  });

  return result;
}

/**
 * 获取权限的中文标签
 */
function getPermissionLabel(permission) {
  const labels = {
    // 系统权限
    SYSTEM_USER_READ: '查看用户',
    SYSTEM_USER_CREATE: '创建用户',
    SYSTEM_USER_UPDATE: '编辑用户',
    SYSTEM_USER_DELETE: '删除用户',
    SYSTEM_USER_MEMBERSHIP_MANAGE: '管理用户会员',
    SYSTEM_ROLE_READ: '查看角色',
    SYSTEM_ROLE_CREATE: '创建角色',
    SYSTEM_ROLE_UPDATE: '编辑角色',
    SYSTEM_ROLE_DELETE: '删除角色',
    SYSTEM_ROLE_PERMISSION_MANAGE: '角色权限管理',
    SYSTEM_FONT_READ: '查看字体',
    SYSTEM_FONT_UPLOAD: '上传字体',
    SYSTEM_FONT_DELETE: '删除字体',
    SYSTEM_FONT_DOWNLOAD: '下载字体',
    SYSTEM_ADMIN: '系统管理',
    SYSTEM_BILLING_READ: '查看支付管理',
    SYSTEM_BILLING_WRITE: '管理支付',
    SYSTEM_MONITOR: '系统监控',
    SYSTEM_CONFIG_READ: '查看配置',
    SYSTEM_CONFIG_WRITE: '修改配置',
    SYSTEM_IP_BLACKLIST_MANAGE: '管理 IP 黑名单',
    SYSTEM_IP_WHITELIST_MANAGE: '管理管理员 IP 白名单',
    PROJECT_CREATE: '创建项目',
    // 公共资源库权限
    LIBRARY_DRAWING_MANAGE: '管理图纸库',
    LIBRARY_BLOCK_MANAGE: '管理图块库',
    // 项目权限
    PROJECT_UPDATE: '编辑项目',
    PROJECT_DELETE: '删除项目',
    PROJECT_MEMBER_MANAGE: '成员管理',
    PROJECT_MEMBER_ASSIGN: '成员分配',
    PROJECT_TRANSFER: '转让所有权',
    PROJECT_TRANSFER_MANAGE: '跨项目转移管理',
    PROJECT_ROLE_MANAGE: '角色管理',
    PROJECT_ROLE_PERMISSION_MANAGE: '角色权限配置',
    FILE_CREATE: '创建文件',
    FILE_UPLOAD: '上传文件',
    FILE_OPEN: '打开文件',
    FILE_EDIT: '编辑文件',
    FILE_DELETE: '删除文件',
    FILE_TRASH_MANAGE: '回收站管理',
    FILE_DOWNLOAD: '下载文件',
    FILE_SHARE: '分享文件',
    FILE_MOVE: '移动文件',
    FILE_COPY: '复制文件',
    CAD_SAVE: '保存图纸',
    CAD_EXTERNAL_REFERENCE: '管理外部参照',
    GALLERY_ADD: '添加到图库',
    VERSION_READ: '查看版本',
  };

  return labels[permission] || permission;
}

// 执行生成
generateFrontendPermissions();
