import 'dotenv/config';
import { PrismaClient, Permission } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

// 手动构建DATABASE_URL，确保格式正确
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
  console.log('开始迁移到角色系统...');

  try {
    // 1. 创建 Role 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "isSystem" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
      );
    `;
    console.log('✓ Role 表已创建');

    // 2. 创建 RolePermission 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "id" TEXT NOT NULL,
        "roleId" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
      );
    `;
    console.log('✓ RolePermission 表已创建');

    // 3. 创建唯一约束
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_key" ON "roles"("name")
    `;
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_roleId_permission_key" ON "role_permissions"("roleId", "permission")
    `;
    console.log('✓ 唯一约束已创建');

    // 4. 创建 ADMIN 角色
    const adminRoleId = 'role-admin-001';
    const adminExists = await prisma.$queryRaw`SELECT id FROM "roles" WHERE id = ${adminRoleId}`;
    if (!adminExists || (adminExists as any[]).length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "roles" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
        VALUES (${adminRoleId}, 'ADMIN', '系统管理员，拥有所有权限', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      console.log('✓ ADMIN 角色已创建');

      // 为 ADMIN 角色添加所有权限
      const adminPermissions: Permission[] = [
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.USER_DELETE,
        Permission.USER_ADMIN,
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.PROJECT_WRITE,
        Permission.PROJECT_DELETE,
        Permission.PROJECT_ADMIN,
        Permission.PROJECT_MEMBER_MANAGE,
        Permission.FILE_CREATE,
        Permission.FILE_READ,
        Permission.FILE_WRITE,
        Permission.FILE_DELETE,
        Permission.FILE_SHARE,
        Permission.FILE_DOWNLOAD,
        Permission.SYSTEM_ADMIN,
        Permission.SYSTEM_MONITOR,
      ];

      for (const perm of adminPermissions) {
        await prisma.$executeRaw`
          INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
          VALUES (gen_random_uuid(), ${adminRoleId}, ${perm}, CURRENT_TIMESTAMP)
        `;
      }
      console.log(`✓ ADMIN 角色已添加 ${adminPermissions.length} 个权限`);
    }

    // 5. 创建 USER 角色
    const userRoleId = 'role-user-001';
    const userExists = await prisma.$queryRaw`SELECT id FROM "roles" WHERE id = ${userRoleId}`;
    if (!userExists || (userExists as any[]).length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "roles" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
        VALUES (${userRoleId}, 'USER', '普通用户，基础权限', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      console.log('✓ USER 角色已创建');

      // 为 USER 角色添加基础权限
      const userPermissions: Permission[] = [
        Permission.PROJECT_CREATE,
        Permission.PROJECT_READ,
        Permission.FILE_CREATE,
        Permission.FILE_READ,
        Permission.FILE_WRITE,
        Permission.FILE_SHARE,
        Permission.FILE_DOWNLOAD,
      ];

      for (const perm of userPermissions) {
        await prisma.$executeRaw`
          INSERT INTO "role_permissions" ("id", "roleId", "permission", "createdAt")
          VALUES (gen_random_uuid(), ${userRoleId}, ${perm}, CURRENT_TIMESTAMP)
        `;
      }
      console.log(`✓ USER 角色已添加 ${userPermissions.length} 个权限`);
    }

    // 6. 添加 roleId 字段到 users 表
    await prisma.$executeRaw`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roleId" TEXT
    `;
    console.log('✓ roleId 字段已添加到 users 表');

    // 7. 为现有用户分配角色
    // 首先检查是否有用户还没有分配角色
    const usersWithoutRole = await prisma.$queryRaw`
      SELECT id, role FROM "users" WHERE "roleId" IS NULL
    ` as any[];

    console.log(`找到 ${usersWithoutRole.length} 个未分配角色的用户`);

    for (const user of usersWithoutRole) {
      // 根据旧的 role 字段值分配新角色
      const targetRoleId = user.role === 'ADMIN' ? adminRoleId : userRoleId;
      await prisma.$executeRaw`
        UPDATE "users" SET "roleId" = ${targetRoleId} WHERE id = ${user.id}
      `;
      console.log(`✓ 用户 ${user.id} 已分配角色 ${user.role}`);
    }

    // 8. 添加外键约束
    await prisma.$executeRaw`
      ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `;
    console.log('✓ 外键约束已添加');

    // 9. 添加 role_permissions 的外键约束
    await prisma.$executeRaw`
      ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `;
    console.log('✓ role_permissions 外键约束已添加');

    console.log('\n✅ 迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('迁移失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });