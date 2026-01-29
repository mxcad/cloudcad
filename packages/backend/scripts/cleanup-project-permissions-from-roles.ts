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

/**
 * 需要移除的项目权限（之前错误添加到 Permission 枚举的）
 */
const PROJECT_PERMISSIONS_TO_REMOVE = [
  'PROJECT_CREATE',
  'PROJECT_READ',
  'PROJECT_UPDATE',
  'PROJECT_DELETE',
  'PROJECT_MEMBER_MANAGE',
  'PROJECT_TRANSFER',
];

async function main() {
  console.log('🚀 开始清理角色中的项目权限...');

  // 删除所有角色中的这些权限记录
  const result = await prisma.rolePermission.deleteMany({
    where: {
      permission: {
        in: PROJECT_PERMISSIONS_TO_REMOVE as any,
      },
    },
  });

  console.log(`✅ 已删除 ${result.count} 条权限记录`);

  // 验证清理结果
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: {
      permissions: true,
    },
  });

  console.log(`\n📊 ADMIN 角色剩余权限数量: ${adminRole?.permissions.length}`);
  console.log('剩余权限列表:');
  adminRole?.permissions.forEach((p, index) => {
    console.log(`  ${index + 1}. ${p.permission}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });