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
  console.log('开始修复数据库缺失字段...\n');

  try {
    // 1. 检查 users 表结构
    const usersColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    console.log('users 表当前字段:');
    console.table(usersColumns);

    // 2. 检查 roles 表是否存在
    const rolesTableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'roles'
      )
    `;
    console.log(`\nroles 表是否存在: ${(rolesTableExists as any[])[0].exists}`);

    // 3. 创建 roles 表（如果不存在）
    if (!(rolesTableExists as any[])[0].exists) {
      console.log('\n创建 roles 表...');
      await prisma.$executeRaw`
        CREATE TABLE "roles" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "category" TEXT NOT NULL DEFAULT 'SYSTEM',
          "level" INTEGER NOT NULL DEFAULT 0,
          "isSystem" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
        )
      `;
      console.log('✓ roles 表已创建');

      // 创建唯一约束
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name")
      `;
      await prisma.$executeRaw`
        CREATE INDEX "roles_category_idx" ON "roles"("category")
      `;
      console.log('✓ roles 表索引已创建');
    }

    // 4. 检查并创建 ADMIN 和 USER 角色
    const adminRole =
      await prisma.$queryRaw`SELECT id FROM "roles" WHERE name = 'ADMIN'`;
    if (!adminRole || (adminRole as any[]).length === 0) {
      console.log('\n创建 ADMIN 角色...');
      await prisma.$executeRaw`
        INSERT INTO "roles" ("id", "name", "description", "category", "level", "isSystem", "createdAt", "updatedAt")
        VALUES ('cm00000000000000000000001', 'ADMIN', '系统管理员，拥有所有权限', 'SYSTEM', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      console.log('✓ ADMIN 角色已创建');
    }

    const userRole =
      await prisma.$queryRaw`SELECT id FROM "roles" WHERE name = 'USER'`;
    if (!userRole || (userRole as any[]).length === 0) {
      console.log('\n创建 USER 角色...');
      await prisma.$executeRaw`
        INSERT INTO "roles" ("id", "name", "description", "category", "level", "isSystem", "createdAt", "updatedAt")
        VALUES ('cm00000000000000000000002', 'USER', '普通用户，基础权限', 'SYSTEM', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      console.log('✓ USER 角色已创建');
    }

    // 5. 检查 users 表是否缺少字段
    const columns = usersColumns as any[];
    const columnNames = columns.map((c) => c.column_name);

    // 添加 roleId 字段
    if (!columnNames.includes('roleId')) {
      console.log('\n添加 roleId 字段到 users 表...');
      await prisma.$executeRaw`
        ALTER TABLE "users" ADD COLUMN "roleId" TEXT
      `;
      console.log('✓ roleId 字段已添加');

      // 为现有用户分配角色
      const adminRoleId = 'cm00000000000000000000001';
      const userRoleId = 'cm00000000000000000000002';

      const usersWithoutRole = await prisma.$queryRaw`
        SELECT id, email FROM "users" WHERE "roleId" IS NULL
      `;

      console.log(`\n为 ${usersWithoutRole.length} 个用户分配角色...`);
      for (const user of usersWithoutRole as any[]) {
        // 默认分配 USER 角色，可以根据需要调整
        await prisma.$executeRaw`
          UPDATE "users" SET "roleId" = ${userRoleId} WHERE id = ${user.id}
        `;
        console.log(`  ✓ 用户 ${user.email} 已分配 USER 角色`);
      }

      // 添加外键约束
      await prisma.$executeRaw`
        ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      `;
      console.log('✓ users.roleId 外键约束已添加');
    }

    // 添加 createdAt 字段（如果不存在）
    if (!columnNames.includes('createdAt')) {
      console.log('\n添加 createdAt 字段到 users 表...');
      await prisma.$executeRaw`
        ALTER TABLE "users" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      `;
      console.log('✓ createdAt 字段已添加');
    }

    // 添加 updatedAt 字段
    if (!columnNames.includes('updatedAt')) {
      console.log('\n添加 updatedAt 字段到 users 表...');
      await prisma.$executeRaw`
        ALTER TABLE "users" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      `;
      console.log('✓ updatedAt 字段已添加');
    }

    // 6. 检查是否需要创建 role_permissions 表
    const rolePermissionsTableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'role_permissions'
      )
    `;

    if (!(rolePermissionsTableExists as any[])[0].exists) {
      console.log('\n创建 role_permissions 表...');
      await prisma.$executeRaw`
        CREATE TABLE "role_permissions" (
          "id" TEXT NOT NULL,
          "roleId" TEXT NOT NULL,
          "permission" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
        )
      `;
      console.log('✓ role_permissions 表已创建');

      // 创建唯一约束
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX "role_permissions_roleId_permission_key" ON "role_permissions"("roleId", "permission")
      `;
      console.log('✓ role_permissions 表索引已创建');

      // 添加外键约束
      await prisma.$executeRaw`
        ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
      console.log('✓ role_permissions 外键约束已添加');
    }

    console.log('\n✅ 数据库修复完成！');
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
