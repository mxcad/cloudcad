/**
 * 迁移 ProjectMember 表的 roleId 到 projectRoleId
 *
 * 步骤：
 * 1. 创建 project_roles 表
 * 2. 创建 project_role_permissions 表
 * 3. 为每个项目创建默认角色
 * 4. 添加 projectRoleId 列（可空）
 * 5. 为现有数据分配默认角色
 * 6. 将 projectRoleId 改为非空
 * 7. 删除旧的 roleId 列
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ProjectRole,
  ProjectPermission,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../src/common/enums/permissions.enum';
import { createId } from '@paralleldrive/cuid2';

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
  console.log('开始迁移 ProjectMember 表的 roleId 到 projectRoleId...');

  try {
    // 步骤 1: 创建 project_roles 表
    const projectRolesTableExists = await prisma.$queryRaw<
      Array<{ table_name: string }>
    >`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'project_roles'
    `;

    if (projectRolesTableExists.length === 0) {
      console.log('创建 project_roles 表...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "project_roles" (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          "projectId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX "project_roles_projectId_idx" ON "project_roles"("projectId")
      `);
    }

    // 步骤 2: 创建 project_role_permissions 表
    const projectRolePermissionsTableExists = await prisma.$queryRaw<
      Array<{ table_name: string }>
    >`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'project_role_permissions'
    `;

    if (projectRolePermissionsTableExists.length === 0) {
      console.log('创建 project_role_permissions 表...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "project_role_permissions" (
          id TEXT PRIMARY KEY,
          "projectRoleId" TEXT NOT NULL,
          permission TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "project_role_permissions_projectRoleId_permission_key" UNIQUE ("projectRoleId", permission)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX "project_role_permissions_projectRoleId_idx" ON "project_role_permissions"("projectRoleId")
      `);
    }

    // 步骤 3: 为每个项目创建默认角色
    const projects = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "file_system_nodes"
      WHERE "isRoot" = true
      AND "deletedAt" IS NULL
    `;

    console.log(`找到 ${projects.length} 个活跃项目`);

    for (const project of projects) {
      // 检查是否已有角色
      const existingRoles = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "project_roles"
        WHERE "projectId" = ${project.id}
      `;

      if (Number(existingRoles[0].count) === 0) {
        console.log(`  为项目 ${project.id} 创建默认角色...`);

        // 创建 OWNER 角色
        const ownerId = createId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "project_roles" (id, name, description, "projectId", "createdAt", "updatedAt")
          VALUES ('${ownerId}', '${ProjectRole.OWNER}', '项目所有者，拥有所有权限', '${project.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // 创建 ADMIN 角色
        const adminId = createId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "project_roles" (id, name, description, "projectId", "createdAt", "updatedAt")
          VALUES ('${adminId}', '${ProjectRole.ADMIN}', '项目管理员', '${project.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // 创建 MEMBER 角色
        const memberId = createId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "project_roles" (id, name, description, "projectId", "createdAt", "updatedAt")
          VALUES ('${memberId}', '${ProjectRole.MEMBER}', '项目成员', '${project.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // 创建 EDITOR 角色
        const editorId = createId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "project_roles" (id, name, description, "projectId", "createdAt", "updatedAt")
          VALUES ('${editorId}', '${ProjectRole.EDITOR}', '项目编辑', '${project.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // 创建 VIEWER 角色
        const viewerId = createId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "project_roles" (id, name, description, "projectId", "createdAt", "updatedAt")
          VALUES ('${viewerId}', '${ProjectRole.VIEWER}', '项目查看者', '${project.id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // 为每个角色分配权限
        for (const [roleName, permissions] of Object.entries(
          DEFAULT_PROJECT_ROLE_PERMISSIONS
        )) {
          let roleId: string;
          switch (roleName) {
            case 'OWNER':
              roleId = ownerId;
              break;
            case 'ADMIN':
              roleId = adminId;
              break;
            case 'MEMBER':
              roleId = memberId;
              break;
            case 'EDITOR':
              roleId = editorId;
              break;
            case 'VIEWER':
              roleId = viewerId;
              break;
            default:
              continue;
          }

          for (const permission of permissions) {
            const permissionId = createId();
            await prisma.$executeRawUnsafe(`
              INSERT INTO "project_role_permissions" (id, "projectRoleId", permission, "createdAt")
              VALUES ('${permissionId}', '${roleId}', '${permission}', CURRENT_TIMESTAMP)
            `);
          }
        }

        console.log(`  项目 ${project.id} 默认角色创建完成`);
      }
    }

    // 步骤 4: 检查 projectRoleId 列是否存在
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'project_members'
      AND column_name = 'projectRoleId'
    `;

    if (columns.length === 0) {
      console.log('添加 projectRoleId 列...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "project_members"
        ADD COLUMN "projectRoleId" TEXT
      `);
    }

    // 步骤 5: 为现有数据分配默认角色
    const members = await prisma.$queryRaw<
      Array<{ id: string; roleId: string; projectId: string }>
    >`
      SELECT id, "roleId", "projectId"
      FROM "project_members"
      WHERE "roleId" IS NOT NULL
    `;

    console.log(`找到 ${members.length} 个需要迁移的成员`);

    // 默认角色映射（系统角色 -> 项目角色）
    const defaultRoleMapping: Record<string, string> = {
      ADMIN: 'ADMIN',
      USER: 'MEMBER',
      PROJECT_ADMIN: 'ADMIN',
      PROJECT_MEMBER: 'MEMBER',
    };

    let updatedCount = 0;
    for (const member of members) {
      const role = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name
        FROM roles
        WHERE id = ${member.roleId}
      `;

      if (role.length > 0) {
        const roleName = role[0].name;
        const mappedRoleName = defaultRoleMapping[roleName] || 'MEMBER';

        // 获取项目的对应角色
        const projectRole = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "project_roles"
          WHERE "projectId" = ${member.projectId}
          AND name = ${mappedRoleName}
          LIMIT 1
        `;

        if (projectRole.length > 0) {
          await prisma.$executeRawUnsafe(`
            UPDATE "project_members"
            SET "projectRoleId" = '${projectRole[0].id}'
            WHERE id = '${member.id}'
          `);
          updatedCount++;
          console.log(
            `  更新成员 ${member.id}: ${roleName} -> ${mappedRoleName}`
          );
        }
      }
    }

    console.log(`更新了 ${updatedCount} 个成员的角色`);

    // 步骤 6: 将 projectRoleId 改为非空
    console.log('将 projectRoleId 改为非空...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "project_members"
      ALTER COLUMN "projectRoleId" SET NOT NULL
    `);

    // 步骤 7: 删除旧的 roleId 列
    console.log('删除旧的 roleId 列...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "project_members"
      DROP COLUMN "roleId"
    `);

    console.log('✅ 迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
