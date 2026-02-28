import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 手动构建DATABASE_URL
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
  console.log('开始修复约束问题...\n');

  try {
    // 1. 检查 project_members 表的约束
    const constraints = await prisma.$queryRaw`
      SELECT
        conname AS constraint_name,
        contype::text AS constraint_type
      FROM pg_constraint
      WHERE conrelid = 'project_members'::regclass
    `;
    console.log('project_members 表约束:');
    console.table(constraints);

    // 2. 检查 project_members 表的索引
    const indexes = await prisma.$queryRaw`
      SELECT
        indexname AS index_name,
        indexdef AS index_definition
      FROM pg_indexes
      WHERE tablename = 'project_members'
    `;
    console.log('\nproject_members 表索引:');
    console.table(indexes);

    // 3. 删除冲突的唯一约束（它会自动删除索引）
    const uniqueConstraint = 'project_members_project_id_user_id_key';
    const constraintExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = ${uniqueConstraint}
      )
    `;

    if ((constraintExists as any[])[0].exists) {
      console.log(`\n删除冲突的约束: ${uniqueConstraint}`);
      await prisma.$executeRaw`
        ALTER TABLE "project_members" DROP CONSTRAINT "${uniqueConstraint}"
      `;
      console.log('✓ 约束已删除');
    }

    // 4. 重新创建唯一的索引（不带约束）
    const indexExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = ${uniqueConstraint}
      )
    `;

    if (!(indexExists as any[])[0].exists) {
      console.log(`\n创建唯一索引: ${uniqueConstraint}`);
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX "${uniqueConstraint}" ON "project_members"("projectId", "userId")
      `;
      console.log('✓ 索引已创建');
    }

    console.log('\n✅ 约束修复完成！');
  } catch (error) {
    console.error('\n❌ 修复失败:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
