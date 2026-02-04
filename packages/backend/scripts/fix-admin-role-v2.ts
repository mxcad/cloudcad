import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = `postgresql://${process.env.DB_USERNAME || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || 'password')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_DATABASE || 'cloucad'}`;

const adapter = new PrismaPg({
  connectionString: dbUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

async function main() {
  console.log('开始修复管理员用户角色...\n');

  // 使用原始 SQL 更新管理员用户的角色
  const result = await prisma.$executeRaw`
    UPDATE users
    SET "roleId" = 'cm00000000000000000000001',
        status = 'ACTIVE',
        "emailVerified" = true,
        "emailVerifiedAt" = CURRENT_TIMESTAMP
    WHERE email = 'admin@cloucad.com'
  `;

  console.log(`✓ 更新了 ${result} 个用户\n`);

  // 验证更新结果
  const adminUser = await prisma.$queryRaw`
    SELECT u.id, u.email, u.username, u."roleId", u.status, u."emailVerified", r.name as "roleName"
    FROM users u
    LEFT JOIN roles r ON u."roleId" = r.id
    WHERE u.email = 'admin@cloucad.com'
  `;

  console.log('管理员用户信息:');
  console.table(adminUser);

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