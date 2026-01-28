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
  adapter,
});

async function main() {
  console.log('检查 ADMIN 角色权限...\n');

  // 查找 ADMIN 角色
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: {
      permissions: {
        select: {
          permission: true,
        },
        orderBy: {
          permission: 'asc',
        },
      },
    },
  });

  if (!adminRole) {
    console.error('❌ 未找到 ADMIN 角色');
    return;
  }

  console.log(`✓ 找到 ADMIN 角色: ${adminRole.name}`);
  console.log(`  描述: ${adminRole.description || '无'}`);
  console.log(`  系统角色: ${adminRole.isSystem ? '是' : '否'}`);
  console.log(`  创建时间: ${adminRole.createdAt}\n`);

  console.log(`✓ ADMIN 角色权限数量: ${adminRole.permissions.length}\n`);

  if (adminRole.permissions.length === 0) {
    console.error('❌ ADMIN 角色没有配置任何权限!');
    console.log('请运行: pnpm db:seed 重新初始化权限');
    return;
  }

  console.log('权限列表:');
  adminRole.permissions.forEach((p, index) => {
    console.log(`  ${index + 1}. ${p.permission}`);
  });

  // 检查是否有特定权限
  const requiredPermissions = [
    'USER_READ',
    'USER_WRITE',
    'USER_DELETE',
    'USER_ADMIN',
    'PROJECT_CREATE',
    'PROJECT_READ',
    'PROJECT_WRITE',
    'FILE_READ',
    'FILE_WRITE',
    'SYSTEM_ADMIN',
    'SYSTEM_MONITOR',
  ];

  console.log('\n检查关键权限:');
  const missingPermissions = [];
  requiredPermissions.forEach((perm) => {
    const hasPermission = adminRole.permissions.some(
      (p) => p.permission === perm
    );
    if (hasPermission) {
      console.log(`  ✓ ${perm}`);
    } else {
      console.log(`  ✗ ${perm} (缺失)`);
      missingPermissions.push(perm);
    }
  });

  if (missingPermissions.length > 0) {
    console.log(`\n⚠️  ADMIN 角色缺失 ${missingPermissions.length} 个关键权限`);
    console.log('缺失的权限:', missingPermissions.join(', '));
  } else {
    console.log('\n✓ 所有关键权限都已配置');
  }
}

main()
  .catch((e) => {
    console.error('检查失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
