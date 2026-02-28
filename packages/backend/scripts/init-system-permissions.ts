import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 手动构建DATABASE_URL
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'password';
const dbDatabase = process.env.DB_DATABASE || 'cloucad';

const encodedPassword = encodeURIComponent(String(dbPassword));
const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbDatabase}`;

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

// 系统权限定义（与 schema.prisma 中的 Permission 枚举一致）
const SYSTEM_PERMISSIONS = [
  // ========== 用户管理 ==========
  'SYSTEM_USER_READ',
  'SYSTEM_USER_CREATE',
  'SYSTEM_USER_UPDATE',
  'SYSTEM_USER_DELETE',

  // ========== 角色权限管理 ==========
  'SYSTEM_ROLE_READ',
  'SYSTEM_ROLE_CREATE',
  'SYSTEM_ROLE_UPDATE',
  'SYSTEM_ROLE_DELETE',
  'SYSTEM_ROLE_PERMISSION_MANAGE',

  // ========== 字体库管理 ==========
  'SYSTEM_FONT_READ',
  'SYSTEM_FONT_UPLOAD',
  'SYSTEM_FONT_DELETE',
  'SYSTEM_FONT_DOWNLOAD',

  // ========== 系统管理 ==========
  'SYSTEM_ADMIN',
  'SYSTEM_MONITOR',
] as const;

// 角色权限映射
const ROLE_PERMISSIONS = {
  ADMIN: SYSTEM_PERMISSIONS,
  USER: [],
};

async function main() {
  console.log('开始初始化系统权限...\n');

  try {
    // 1. 获取角色
    const adminRole = await prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });

    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
    });

    if (!adminRole || !userRole) {
      console.error('❌ 角色不存在，请先运行 fix-missing-fields.ts 创建角色');
      process.exit(1);
    }

    console.log(`找到角色: ADMIN (${adminRole.id}), USER (${userRole.id})\n`);

    // 2. 为 ADMIN 角色分配权限
    console.log('为 ADMIN 角色分配权限...');
    const adminPermissions = ROLE_PERMISSIONS.ADMIN;

    // 先删除现有权限（如果有）
    await prisma.rolePermission.deleteMany({
      where: { roleId: adminRole.id },
    });

    // 添加新权限
    for (const permission of adminPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permission: permission as any,
        },
      });
      console.log(`  ✓ ${permission}`);
    }

    console.log(`\n✓ ADMIN 角色已添加 ${adminPermissions.length} 个权限\n`);

    // 3. 为 USER 角色分配权限（空权限）
    console.log('为 USER 角色分配权限...');
    await prisma.rolePermission.deleteMany({
      where: { roleId: userRole.id },
    });
    console.log('  ✓ USER 角色权限已清空（无基础权限）\n');

    console.log('✅ 系统权限初始化完成！');

    // 4. 验证权限
    const adminPermsCount = await prisma.rolePermission.count({
      where: { roleId: adminRole.id },
    });
    const userPermsCount = await prisma.rolePermission.count({
      where: { roleId: userRole.id },
    });

    console.log(`\n验证结果:`);
    console.log(`  ADMIN 角色权限数: ${adminPermsCount}`);
    console.log(`  USER 角色权限数: ${userPermsCount}`);
  } catch (error) {
    console.error('\n❌ 初始化失败:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
