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
import { join } from 'path';

/**
 * 从 Prisma Schema 中提取枚举值
 */
function extractEnumsFromSchema() {
  const schemaPath = join(__dirname, '../packages/backend/prisma/schema.prisma');
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  const enums: Record<string, string[]> = {};

  // 匹配 enum 定义
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];

    // 提取枚举值
    const values = enumBody
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//')) // 移除注释和空行
      .map(line => line.replace(/,.?$/, '')) // 移除末尾逗号
      .filter(line => line.length > 0);

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

    // 生成文件内容
    const fileContent = `/**
 * 权限常量 - 自动生成，请勿手动修改
 *
 * 生成时间: ${new Date().toISOString()}
 * 来源: Prisma Schema (packages/backend/prisma/schema.prisma)
 *
 * 如需修改权限，请编辑 packages/backend/prisma/schema.prisma 文件，
 * 然后运行 pnpm generate:frontend-permissions 重新生成
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
`;

    // 写入文件
    const outputPath = join(__dirname, '../packages/frontend/constants/permissions.ts');
    writeFileSync(outputPath, fileContent, 'utf-8');

    console.log(`✅ 前端权限常量生成完成`);
    console.log(`📁 输出文件: ${outputPath}`);
    console.log(`📊 系统权限: ${systemPermissions.length} 个`);
    console.log(`📊 项目权限: ${projectPermissions.length} 个`);
    console.log(`📊 总计: ${systemPermissions.length + projectPermissions.length} 个`);
  } catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  }
}

// 执行生成
generateFrontendPermissions();