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

const prisma = new PrismaClient({ adapter });

async function main() {
  const targetUsername = 'tagtestuser';

  console.log(`正在激活用户: ${targetUsername}...`);

  // 获取 ADMIN 角色
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    console.error('ADMIN 角色不存在!');
    process.exit(1);
  }

  // 更新用户
  const updatedUser = await prisma.user.update({
    where: { username: targetUsername },
    data: {
      status: 'ACTIVE',
      roleId: adminRole.id,
    },
    include: {
      role: true,
    },
  });

  console.log(`✓ 用户 ${targetUsername} 已成功激活并设置为管理员!`);
  console.log(`  - 用户名: ${updatedUser.username}`);
  console.log(`  - 邮箱: ${updatedUser.email}`);
  console.log(`  - 状态: ${updatedUser.status}`);
  console.log(`  - 角色: ${updatedUser.role.name}`);
}

main()
  .catch((e) => {
    console.error('激活用户失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
