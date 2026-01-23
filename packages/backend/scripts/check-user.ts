import 'dotenv/config';
import { PrismaClient, UserStatus } from '@prisma/client';
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
  console.log('查询用户信息...\n');

  // 查询所有用户
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      nickname: true,
      status: true,
      emailVerified: true,
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystem: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log('所有用户列表：');
  console.log('='.repeat(80));
  users.forEach((user) => {
    console.log(
      `ID: ${user.id.substring(0, 8)}... | 用户名: ${user.username.padEnd(15)} | 邮箱: ${user.email.padEnd(30)} | 角色: ${user.role.name.padEnd(10)} | 状态: ${user.status}`
    );
  });

  console.log('\n' + '='.repeat(80));

  // 查找 qm2 用户
  const qm2User = await prisma.user.findFirst({
    where: {
      OR: [{ username: 'qm2' }, { email: { contains: 'qm2' } }],
    },
    select: {
      id: true,
      email: true,
      username: true,
      nickname: true,
      status: true,
      emailVerified: true,
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystem: true,
          permissions: {
            select: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (qm2User) {
    console.log('\nqm2 用户信息：');
    console.log('-'.repeat(80));
    console.log(`用户ID: ${qm2User.id}`);
    console.log(`用户名: ${qm2User.username}`);
    console.log(`邮箱: ${qm2User.email}`);
    console.log(`昵称: ${qm2User.nickname || '未设置'}`);
    console.log(`状态: ${qm2User.status}`);
    console.log(`邮箱已验证: ${qm2User.emailVerified}`);
    console.log(`\n角色信息：`);
    console.log(`  角色ID: ${qm2User.role.id}`);
    console.log(`  角色名称: ${qm2User.role.name}`);
    console.log(`  角色描述: ${qm2User.role.description || '未设置'}`);
    console.log(`  系统角色: ${qm2User.role.isSystem}`);
    console.log(`  权限列表:`);
    qm2User.role.permissions.forEach((p) => {
      console.log(`    - ${p.permission}`);
    });
  } else {
    console.log('\n未找到 qm2 用户');
  }

  // 查询 ADMIN 角色的所有用户
  const adminUsers = await prisma.user.findMany({
    where: {
      role: {
        name: 'ADMIN',
      },
    },
    select: {
      id: true,
      email: true,
      username: true,
      nickname: true,
      status: true,
    },
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\nADMIN 角色用户列表（共 ${adminUsers.length} 人）：`);
  adminUsers.forEach((user) => {
    console.log(`  - ${user.username} (${user.email}) - ${user.nickname || '无昵称'}`);
  });
}

main()
  .catch((e) => {
    console.error('查询失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });