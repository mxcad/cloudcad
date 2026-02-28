import 'dotenv/config';
import { PrismaClient, Permission } from '@prisma/client';
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

/**
 * 需要添加到 ADMIN 角色的项目权限
 */
const PROJECT_PERMISSIONS = [
  Permission.PROJECT_CREATE,
  Permission.PROJECT_READ,
  Permission.PROJECT_UPDATE,
  Permission.PROJECT_DELETE,
  Permission.PROJECT_MEMBER_MANAGE,
  Permission.PROJECT_TRANSFER,
];

async function main() {
  console.log('🚀 开始为 ADMIN 角色添加项目权限...');

  // 查找 ADMIN 角色
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: {
      permissions: true,
    },
  });

  if (!adminRole) {
    console.error('❌ 未找到 ADMIN 角色');
    return;
  }

  console.log(`✅ 找到 ADMIN 角色 (ID: ${adminRole.id})`);

  // 获取当前权限
  const currentPermissions = adminRole.permissions.map((p) => p.permission);
  console.log(`📊 当前权限数量: ${currentPermissions.length}`);

  // 添加缺失的项目权限
  let addedCount = 0;
  for (const permission of PROJECT_PERMISSIONS) {
    if (!currentPermissions.includes(permission)) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permission,
        },
      });
      console.log(`  ✅ 添加权限: ${permission}`);
      addedCount++;
    } else {
      console.log(`  ℹ️  权限已存在: ${permission}`);
    }
  }

  console.log(`\n🎉 完成！共添加 ${addedCount} 个新权限`);

  // 验证结果
  const updatedAdminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: {
      permissions: true,
    },
  });

  console.log(`\n📊 更新后权限数量: ${updatedAdminRole?.permissions.length}`);
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
