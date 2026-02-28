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

// 需要删除的冗余系统角色（真正的项目角色在 ProjectRole 表中）
const ROLES_TO_DELETE = [
  'PROJECT_OWNER',
  'PROJECT_ADMIN',
  'PROJECT_MEMBER',
  'PROJECT_EDITOR',
  'PROJECT_VIEWER',
];

async function main() {
  console.log('开始清理冗余的系统角色（PROJECT_*）...');

  let deletedCount = 0;

  for (const roleName of ROLES_TO_DELETE) {
    console.log(`\n处理角色: ${roleName}`);

    // 检查角色是否存在
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      console.log(`  ✓ 角色不存在，跳过`);
      continue;
    }

    // 检查是否有用户使用此角色
    if (role._count.users > 0) {
      console.log(
        `  ⚠ 警告: 角色正在被 ${role._count.users} 个用户使用，无法删除`
      );
      console.log(`  用户列表:`);

      const users = await prisma.user.findMany({
        where: { roleId: role.id },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
        },
      });

      users.forEach((user) => {
        console.log(`    - ${user.nickname} (${user.email})`);
      });

      continue;
    }

    // 删除角色（级联删除角色权限）
    await prisma.role.delete({
      where: { id: role.id },
    });

    console.log(`  ✓ 已删除角色: ${roleName}`);
    deletedCount++;
  }

  console.log(`\n✓ 清理完成! 共删除 ${deletedCount} 个角色`);

  if (deletedCount === 0) {
    console.log('\n提示: 所有角色都已清理，或无法删除（有用户使用）');
  }
}

main()
  .catch((e) => {
    console.error('清理失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
