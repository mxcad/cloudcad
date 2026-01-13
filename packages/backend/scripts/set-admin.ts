import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const targetUsername = 'qm2';

  console.log(`正在查找用户: ${targetUsername}...`);

  // 获取 ADMIN 角色
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    console.error('ADMIN 角色不存在!');
    process.exit(1);
  }

  // 查找用户（按用户名或邮箱）
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: targetUsername }, { email: targetUsername }],
    },
    include: {
      role: true,
    },
  });

  if (!user) {
    console.error(`用户 ${targetUsername} 不存在!`);
    process.exit(1);
  }

  console.log(
    `找到用户: ${user.username} (${user.email}), 当前角色: ${user.role.name}`
  );

  // 更新用户角色为管理员
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { roleId: adminRole.id },
    include: {
      role: true,
    },
  });

  console.log(`✓ 用户 ${targetUsername} 已成功设置为管理员!`);
  console.log(`  - 用户名: ${updatedUser.username}`);
  console.log(`  - 邮箱: ${updatedUser.email}`);
  console.log(`  - 新角色: ${updatedUser.role.name}`);
}

main()
  .catch((e) => {
    console.error('设置管理员失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
