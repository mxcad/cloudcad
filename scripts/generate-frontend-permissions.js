/**
 * 前端权限常量生成脚本
 *
 * 从 Prisma Schema 读取权限枚举定义，自动生成前端权限常量文件
 * 确保前后端权限定义保持一致
 *
 * 使用方法：
 *   pnpm generate:frontend-permissions
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 从 Prisma Schema 中提取枚举值
 */
function extractEnumsFromSchema() {
  const schemaPath = join(
    __dirname,
    '../packages/backend/prisma/schema.prisma'
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
      .filter((line) => line && !line.startsWith('//')) // 移除注释和空行
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

    // 生成权限依赖关系
    const permissionDependencies = generatePermissionDependencies(
      systemPermissions,
      projectPermissions
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
${systemPermissionsObject}
} as const;

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 */
export const ProjectPermission = {
${projectPermissionsObject}
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
${permissionDependencies}
};

/**
 * 权限分组定义
 */
export const PERMISSION_GROUPS = {
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
 * 生成权限依赖关系
 */
function generatePermissionDependencies(
  systemPermissions,
  projectPermissions
) {
  const dependencies = {};

  // 系统权限依赖
  if (systemPermissions.includes('SYSTEM_USER_UPDATE')) {
    dependencies['SYSTEM_USER_UPDATE'] = ['SYSTEM_USER_READ'];
  }
  if (systemPermissions.includes('SYSTEM_USER_DELETE')) {
    dependencies['SYSTEM_USER_DELETE'] = ['SYSTEM_USER_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_UPDATE')) {
    dependencies['SYSTEM_ROLE_UPDATE'] = ['SYSTEM_ROLE_READ'];
  }
  if (systemPermissions.includes('SYSTEM_ROLE_DELETE')) {
    dependencies['SYSTEM_ROLE_DELETE'] = ['SYSTEM_ROLE_READ'];
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

  // 项目权限依赖
  if (projectPermissions.includes('PROJECT_UPDATE')) {
    dependencies['PROJECT_UPDATE'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('PROJECT_DELETE')) {
    dependencies['PROJECT_DELETE'] = ['PROJECT_UPDATE'];
  }
  if (projectPermissions.includes('PROJECT_MEMBER_MANAGE')) {
    dependencies['PROJECT_MEMBER_MANAGE'] = ['PROJECT_UPDATE'];
  }
  if (projectPermissions.includes('PROJECT_MEMBER_ASSIGN')) {
    dependencies['PROJECT_MEMBER_ASSIGN'] = ['PROJECT_UPDATE'];
  }
  if (projectPermissions.includes('PROJECT_TRANSFER')) {
    dependencies['PROJECT_TRANSFER'] = ['PROJECT_UPDATE'];
  }
  if (projectPermissions.includes('FILE_EDIT')) {
    dependencies['FILE_EDIT'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('FILE_DELETE')) {
    dependencies['FILE_DELETE'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('FILE_TRASH_MANAGE')) {
    dependencies['FILE_TRASH_MANAGE'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('FILE_DOWNLOAD')) {
    dependencies['FILE_DOWNLOAD'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('CAD_SAVE')) {
    dependencies['CAD_SAVE'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('CAD_EXPORT')) {
    dependencies['CAD_EXPORT'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('CAD_EXTERNAL_REFERENCE')) {
    dependencies['CAD_EXTERNAL_REFERENCE'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('GALLERY_ADD')) {
    dependencies['GALLERY_ADD'] = ['FILE_OPEN'];
  }
  if (projectPermissions.includes('VERSION_READ')) {
    dependencies['VERSION_READ'] = ['FILE_OPEN'];
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
      result += `    {\n      label: '${label}',\n      items: [\n`;
      items.forEach((item) => {
        result += `        { key: '${item.key}', label: '${item.label}' },\n`;
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
      result += `    {\n      label: '${label}',\n      items: [\n`;
      items.forEach((item) => {
        result += `        { key: '${item.key}', label: '${item.label}' },\n`;
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
    SYSTEM_MONITOR: '系统监控',
    // 项目权限
    PROJECT_UPDATE: '编辑项目',
    PROJECT_DELETE: '删除项目',
    PROJECT_MEMBER_MANAGE: '成员管理',
    PROJECT_MEMBER_ASSIGN: '成员分配',
    PROJECT_TRANSFER: '转让所有权',
    PROJECT_ROLE_MANAGE: '角色管理',
    PROJECT_ROLE_PERMISSION_MANAGE: '角色权限配置',
    FILE_CREATE: '创建文件',
    FILE_UPLOAD: '上传文件',
    FILE_OPEN: '查看文件',
    FILE_EDIT: '编辑文件',
    FILE_DELETE: '删除文件',
    FILE_TRASH_MANAGE: '回收站管理',
    FILE_DOWNLOAD: '下载文件',
    FILE_MOVE: '移动文件',
    FILE_COPY: '复制文件',
    CAD_SAVE: '保存图纸',
    CAD_EXPORT: '导出图纸',
    CAD_EXTERNAL_REFERENCE: '管理外部参照',
    GALLERY_ADD: '添加到图库',
    VERSION_READ: '查看版本',
  };

  return labels[permission] || permission;
}

// 执行生成
generateFrontendPermissions();
