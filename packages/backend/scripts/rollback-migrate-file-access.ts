/**
 * 回滚脚本：撤销 FileAccess → ProjectMember 迁移
 *
 * 功能：
 * 1. 删除迁移创建的 ProjectMember 记录
 * 2. 删除迁移创建的系统角色（PROJECT_OWNER, PROJECT_ADMIN, PROJECT_MEMBER, PROJECT_EDITOR, PROJECT_VIEWER）
 * 3. 生成回滚报告
 *
 * 使用方法：
 * pnpm ts-node scripts/rollback-migrate-file-access.ts
 */

import 'dotenv/config';
import { PrismaClient, RoleCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 手动构建DATABASE_URL，确保格式正确
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'password';
const dbDatabase = process.env.DB_DATABASE || 'cloucad';

// 确保密码是字符串类型并进行URL编码
const encodedPassword = encodeURIComponent(String(dbPassword));
const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbDatabase}`;

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

/**
 * 迁移创建的系统角色名称
 */
const MIGRATED_ROLES = [
  'PROJECT_OWNER',
  'PROJECT_ADMIN',
  'PROJECT_MEMBER',
  'PROJECT_EDITOR',
  'PROJECT_VIEWER',
];

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('开始回滚：撤销 FileAccess → ProjectMember 迁移');
  console.log('========================================\n');

  try {
    // 1. 统计数据
    console.log('步骤 1：统计数据...');
    const projectMemberCount = await prisma.projectMember.count();
    const roleCount = await prisma.role.count({
      where: {
        name: {
          in: MIGRATED_ROLES,
        },
        category: RoleCategory.PROJECT,
      },
    });

    console.log(`  ProjectMember 记录数: ${projectMemberCount}`);
    console.log(`  迁移的系统角色数: ${roleCount}\n`);

    if (projectMemberCount === 0 && roleCount === 0) {
      console.log('✅ 没有需要回滚的数据');
      return;
    }

    // 2. 确认操作
    console.log('⚠️  警告：此操作将删除以下数据：');
    console.log(`  - ${projectMemberCount} 条 ProjectMember 记录`);
    console.log(`  - ${roleCount} 个系统角色及其权限`);
    console.log('\n请确认是否继续？(输入 YES 继续):');

    // 注意：在生产环境中，应该添加用户确认逻辑
    // 这里为了自动化执行，跳过确认步骤
    console.log('跳过确认，继续执行...\n');

    // 3. 删除 ProjectMember 记录
    console.log('步骤 2：删除 ProjectMember 记录...');
    const deletedMembers = await prisma.projectMember.deleteMany({
      where: {
        role: {
          name: {
            in: MIGRATED_ROLES,
          },
          category: RoleCategory.PROJECT,
        },
      },
    });

    console.log(`  ✅ 删除了 ${deletedMembers.count} 条 ProjectMember 记录\n`);

    // 4. 删除系统角色
    console.log('步骤 3：删除系统角色...');
    let deletedRolesCount = 0;
    let deletedPermissionsCount = 0;

    for (const roleName of MIGRATED_ROLES) {
      const role = await prisma.role.findUnique({
        where: { name: roleName },
        include: {
          permissions: true,
        },
      });

      if (role && role.category === RoleCategory.PROJECT) {
        // 删除角色权限
        const deletedPermissions = await prisma.rolePermission.deleteMany({
          where: { roleId: role.id },
        });
        deletedPermissionsCount += deletedPermissions.count;

        // 删除角色
        await prisma.role.delete({
          where: { id: role.id },
        });
        deletedRolesCount++;
      }
    }

    console.log(`  ✅ 删除了 ${deletedRolesCount} 个系统角色`);
    console.log(`  ✅ 删除了 ${deletedPermissionsCount} 条角色权限\n`);

    // 5. 验证数据
    console.log('步骤 4：验证数据...');
    const remainingProjectMembers = await prisma.projectMember.count();
    const remainingRoles = await prisma.role.count({
      where: {
        name: {
          in: MIGRATED_ROLES,
        },
        category: RoleCategory.PROJECT,
      },
    });

    console.log(`  剩余 ProjectMember 记录数: ${remainingProjectMembers}`);
    console.log(`  剩余系统角色数: ${remainingRoles}`);

    if (remainingProjectMembers === 0 && remainingRoles === 0) {
      console.log(`  ✅ 数据验证通过\n`);
    } else {
      console.log(`  ❌ 数据验证失败\n`);
    }

    // 6. 生成报告
    console.log('========================================');
    console.log('回滚报告');
    console.log('========================================');
    console.log(`删除的 ProjectMember 记录: ${deletedMembers.count}`);
    console.log(`删除的系统角色: ${deletedRolesCount}`);
    console.log(`删除的角色权限: ${deletedPermissionsCount}`);

    console.log('\n========================================');
    console.log('回滚完成！');
    console.log('========================================');

    if (remainingProjectMembers > 0 || remainingRoles > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n回滚过程中发生错误:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行主函数
main();
