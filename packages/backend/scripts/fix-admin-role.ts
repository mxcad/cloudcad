import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = `postgresql://${process.env.DB_USERNAME || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || 'password')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_DATABASE || 'cloucad'}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl }),
});

async function main() {
  console.log('开始修复管理员用户角色...\n');

  // 获取 ADMIN 角色ID
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    console.error('❌ ADMIN 角色不存在');
    process.exit(1);
  }

  console.log(`ADMIN 角色ID: ${adminRole.id}`);

  // 更新管理员用户的角色
  const result = await prisma.user.updateMany({
    where: {
      email: 'admin@cloucad.com',
    },
    data: {
      roleId: adminRole.id,
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✓ 更新了 ${result.count} 个用户\n`);

  // 验证更新结果
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@cloucad.com' },
    include: { role: true },
  });

  console.log('管理员用户信息:');
  console.log({
    email: adminUser.email,
    username: adminUser.username,
    roleId: adminUser.roleId,
    roleName: adminUser.role?.name,
    status: adminUser.status,
    emailVerified: adminUser.emailVerified,
  });

  console.log('\n✅ 管理员用户角色修复完成！');
}

main()
  .catch((e) => {
    console.error('修复失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
