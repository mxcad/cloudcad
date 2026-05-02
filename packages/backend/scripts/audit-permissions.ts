/**
 * 权限审计脚本
 * 
 * 功能：
 * 1. 检查系统角色权限是否与代码定义一致
 * 2. 检查项目角色权限是否与代码定义一致
 * 3. 输出详细的权限审计报告
 * 
 * 使用方式：
 * ```bash
 * cd packages/backend
 * pnpm db:audit-permissions
 * ```
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  SYSTEM_ROLE_PERMISSIONS,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  SystemRole,
  ProjectRole,
} from '../src/common/enums/permissions.enum';

// 将枚举键转换为字符串键，方便审计脚本使用
const SYSTEM_ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  [SystemRole.ADMIN]: SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN] as string[],
  [SystemRole.USER_MANAGER]: SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER] as string[],
  [SystemRole.FONT_MANAGER]: SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER] as string[],
  [SystemRole.USER]: SYSTEM_ROLE_PERMISSIONS[SystemRole.USER] as string[],
};

const PROJECT_ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  [ProjectRole.OWNER]: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.OWNER] as string[],
  [ProjectRole.ADMIN]: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.ADMIN] as string[],
  [ProjectRole.MEMBER]: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.MEMBER] as string[],
  [ProjectRole.EDITOR]: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.EDITOR] as string[],
  [ProjectRole.VIEWER]: DEFAULT_PROJECT_ROLE_PERMISSIONS[ProjectRole.VIEWER] as string[],
};

interface AuditResult {
  roleName: string;
  roleType: 'system' | 'project';
  expectedPerms: string[];
  actualPerms: string[];
  missingPerms: string[];
  extraPerms: string[];
  status: 'ok' | 'warning' | 'error';
}

async function auditPermissions(): Promise<void> {
  // 从环境变量获取数据库连接
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cloudcad';
  
  console.log('数据库连接:', databaseUrl.replace(/:[^:@]*@/, ':***@'));

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');

    console.log('🔍 开始权限审计...\n');

    const results: AuditResult[] = [];

    // 1. 审计系统角色
    console.log('=== 系统角色权限审计 ===\n');

    for (const [roleName, expectedPerms] of Object.entries(SYSTEM_ROLE_PERMISSIONS_MAP)) {
      const role = await prisma.role.findFirst({
        where: { name: roleName },
        include: { permissions: true },
      });

      if (!role) {
        console.log(`❌ 角色 ${roleName} 不存在`);
        continue;
      }

      const actualPerms = role.permissions.map(p => String(p.permission));
      const expectedSet = new Set(expectedPerms);
      const actualSet = new Set(actualPerms);

      const missingPerms = expectedPerms.filter(p => !actualSet.has(p));
      const extraPerms = actualPerms.filter(p => !expectedSet.has(p));

      const status: 'ok' | 'warning' | 'error' = 
        missingPerms.length === 0 && extraPerms.length === 0 ? 'ok' :
        missingPerms.length > 0 ? 'warning' : 'error';

      results.push({
        roleName,
        roleType: 'system',
        expectedPerms,
        actualPerms,
        missingPerms,
        extraPerms,
        status,
      });

      // 输出审计结果
      const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️ ' : '❌';
      console.log(`${icon} ${roleName} (${role.category})`);
      console.log(`   实际权限数: ${actualPerms.length}`);
      
      if (missingPerms.length > 0) {
        console.log(`   ⚠️  缺少权限 (${missingPerms.length}):`);
        missingPerms.forEach(p => console.log(`      - ${p}`));
      }

      if (extraPerms.length > 0) {
        console.log(`   ❌ 多余权限 (${extraPerms.length}):`);
        extraPerms.forEach(p => console.log(`      - ${p}`));
      }

      if (status === 'ok') {
        console.log(`   ✅ 权限正常`);
      }

      console.log('');
    }

    // 2. 审计项目角色
    console.log('\n=== 项目角色权限审计 ===\n');

    for (const [roleName, expectedPerms] of Object.entries(PROJECT_ROLE_PERMISSIONS_MAP)) {
      const role = await prisma.projectRole.findFirst({
        where: { name: roleName, isSystem: true },
        include: { permissions: true },
      });

      if (!role) {
        console.log(`❌ 角色 ${roleName} 不存在`);
        continue;
      }

      const actualPerms = role.permissions.map(p => String(p.permission));
      const expectedSet = new Set(expectedPerms);
      const actualSet = new Set(actualPerms);

      const missingPerms = expectedPerms.filter(p => !actualSet.has(p));
      const extraPerms = actualPerms.filter(p => !expectedSet.has(p));

      const status: 'ok' | 'warning' | 'error' = 
        missingPerms.length === 0 && extraPerms.length === 0 ? 'ok' :
        missingPerms.length > 0 ? 'warning' : 'error';

      results.push({
        roleName,
        roleType: 'project',
        expectedPerms,
        actualPerms,
        missingPerms,
        extraPerms,
        status,
      });

      // 输出审计结果
      const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️ ' : '❌';
      console.log(`${icon} ${roleName}`);
      console.log(`   实际权限数: ${actualPerms.length}`);
      
      if (missingPerms.length > 0) {
        console.log(`   ⚠️  缺少权限 (${missingPerms.length}):`);
        missingPerms.forEach(p => console.log(`      - ${p}`));
      }

      if (extraPerms.length > 0) {
        console.log(`   ❌ 多余权限 (${extraPerms.length}):`);
        extraPerms.forEach(p => console.log(`      - ${p}`));
      }

      if (status === 'ok') {
        console.log(`   ✅ 权限正常`);
      }

      console.log('');
    }

    // 3. 输出审计总结
    console.log('\n=== 审计总结 ===\n');
    
    const okCount = results.filter(r => r.status === 'ok').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`总角色数: ${results.length}`);
    console.log(`✅ 正常: ${okCount}`);
    console.log(`⚠️  缺少权限: ${warningCount}`);
    console.log(`❌ 多余权限: ${errorCount}`);

    // 4. 生成修复建议
    const needsFixing = results.filter(r => r.status !== 'ok');
    if (needsFixing.length > 0) {
      console.log('\n=== 修复建议 ===\n');
      
      for (const result of needsFixing) {
        console.log(`角色: ${result.roleName} (${result.roleType})`);
        
        if (result.missingPerms.length > 0) {
          console.log(`  需要添加的权限:`);
          result.missingPerms.forEach(p => console.log(`    - ${p}`));
        }

        if (result.extraPerms.length > 0) {
          console.log(`  建议删除的权限:`);
          result.extraPerms.forEach(p => console.log(`    - ${p}`));
        }

        console.log('');
      }

      console.log('运行以下 SQL 修复数据库:\n');
      
      for (const result of needsFixing) {
        const roleTable = result.roleType === 'system' ? '"Role"' : '"ProjectRole"';
        const permTable = result.roleType === 'system' ? '"RolePermission"' : '"ProjectRolePermission"';
        const roleIdField = result.roleType === 'system' ? '"roleId"' : '"projectRoleId"';

        if (result.extraPerms.length > 0) {
          console.log(`-- 删除 ${result.roleName} 的多余权限`);
          console.log(`DELETE FROM ${permTable}`);
          console.log(`WHERE ${roleIdField} = (SELECT id FROM ${roleTable} WHERE name = '${result.roleName}')`);
          console.log(`  AND permission IN (${result.extraPerms.map(p => `'${p}'`).join(', ')});`);
          console.log('');
        }

        if (result.missingPerms.length > 0) {
          console.log(`-- 添加 ${result.roleName} 缺失的权限`);
          const values = result.missingPerms.map(p => 
            `  ((SELECT id FROM ${roleTable} WHERE name = '${result.roleName}'), '${p}')`
          ).join(',\n');
          console.log(`INSERT INTO ${permTable} (${roleIdField}, permission) VALUES`);
          console.log(`${values};`);
          console.log('');
        }
      }
    } else {
      console.log('\n✅ 所有角色权限配置正常，无需修复！');
    }

  } catch (error) {
    console.error('审计失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行审计
auditPermissions();
