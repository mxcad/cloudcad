import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
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

console.log('数据库连接URL:', databaseUrl.replace(/:[^:@]*@/, ':***@')); // 隐藏密码的日志

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

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
    console.log('当前数据库中的用户:');
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });
    allUsers.forEach((u) => {
      console.log(`  - ${u.username} (${u.email}): ${u.role.name}`);
    });
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
