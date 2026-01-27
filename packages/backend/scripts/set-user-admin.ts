import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.error('请提供用户名');
    console.log('用法: pnpm exec ts-node scripts/set-user-admin.ts <username>');
    console.log('示例: pnpm exec ts-node scripts/set-user-admin.ts qm2');
    process.exit(1);
  }

  console.log(`正在将用户 ${username} 升级为管理员...\n`);

  // 查找 ADMIN 角色
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    console.error('未找到 ADMIN 角色');
    process.exit(1);
  }

  // 查找用户
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }],
    },
    include: {
      role: true,
    },
  });

  if (!user) {
    console.error(`未找到用户: ${username}`);
    process.exit(1);
  }

  console.log('用户当前信息：');
  console.log(`  用户名: ${user.username}`);
  console.log(`  邮箱: ${user.email}`);
  console.log(`  昵称: ${user.nickname || '未设置'}`);
  console.log(`  当前角色: ${user.role.name}`);

  if (user.role.name === 'ADMIN') {
    console.log('\n该用户已经是管理员，无需修改');
    process.exit(0);
  }

  // 更新用户角色
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { roleId: adminRole.id },
    include: {
      role: true,
    },
  });

  console.log('\n用户角色已更新：');
  console.log(`  用户名: ${updatedUser.username}`);
  console.log(`  邮箱: ${updatedUser.email}`);
  console.log(`  新角色: ${updatedUser.role.name}`);
  console.log('\n✅ 用户已成功升级为管理员');
}

main()
  .catch((e) => {
    console.error('操作失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
