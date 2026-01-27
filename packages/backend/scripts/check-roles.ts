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
  console.log('查询角色信息...\n');

  // 查询所有角色
  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        select: {
          permission: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log('所有角色列表：');
  console.log('='.repeat(80));
  roles.forEach((role) => {
    console.log(`\n角色ID: ${role.id.substring(0, 8)}...`);
    console.log(`角色名称: ${role.name}`);
    console.log(`角色描述: ${role.description || '未设置'}`);
    console.log(`系统角色: ${role.isSystem}`);
    console.log(`权限数量: ${role.permissions.length}`);
    console.log(`权限列表:`);
    role.permissions.forEach((p) => {
      console.log(`  - ${p.permission} (类型: ${typeof p.permission})`);
    });
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\n总计: ${roles.length} 个角色`);
}

main()
  .catch((e) => {
    console.error('查询失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });