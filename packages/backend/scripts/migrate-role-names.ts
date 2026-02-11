/**
 * 角色表字段迁移脚本
 *
 * 将 Role 和 ProjectRole 表的 name 字段迁移为 code 字段
 * 并添加 displayName 字段，存储中文名称
 *
 * 运行方式:
 * pnpm ts-node scripts/migrate-role-names.ts
 */

import { DatabaseService } from '../src/database/database.service';

const db = new DatabaseService();

// 系统角色代码到显示名称的映射
const SYSTEM_ROLE_DISPLAY_NAMES: Record<string, string> = {
  ADMIN: '系统管理员',
  USER_MANAGER: '用户管理员',
  FONT_MANAGER: '字体管理员',
  USER: '普通用户',
};

// 项目角色代码到显示名称的映射
const PROJECT_ROLE_DISPLAY_NAMES: Record<string, string> = {
  PROJECT_OWNER: '项目所有者',
  PROJECT_ADMIN: '项目管理员',
  PROJECT_EDITOR: '项目编辑者',
  PROJECT_MEMBER: '项目成员',
  PROJECT_VIEWER: '项目查看者',
};

async function migrateRoles() {
  console.log('开始迁移角色数据...');

  try {
    // 1. 添加临时字段 code_temp 和 displayName_temp
    console.log('步骤 1: 添加临时字段...');
    try {
      await db.$queryRaw`ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "code_temp" TEXT`;
      await db.$queryRaw`ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "displayName_temp" TEXT`;
      await db.$queryRaw`ALTER TABLE "project_roles" ADD COLUMN IF NOT EXISTS "code_temp" TEXT`;
      await db.$queryRaw`ALTER TABLE "project_roles" ADD COLUMN IF NOT EXISTS "displayName_temp" TEXT`;
    } catch (error) {
      console.log('  - 临时字段可能已存在，继续执行');
    }

    // 2. 迁移 Role 表数据
    console.log('步骤 2: 迁移 Role 表数据...');
    const roles = await db.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM "roles"
    `;

    for (const role of roles) {
      const displayName = SYSTEM_ROLE_DISPLAY_NAMES[role.name] || role.name;
      await db.$queryRaw`
        UPDATE "roles"
        SET "code_temp" = ${role.name},
            "displayName_temp" = ${displayName}
        WHERE id = ${role.id}
      `;
      console.log(`  - 迁移角色: ${role.name} -> displayName: ${displayName}`);
    }

    // 3. 迁移 ProjectRole 表数据
    console.log('步骤 3: 迁移 ProjectRole 表数据...');
    const projectRoles = await db.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM "project_roles"
    `;

    for (const role of projectRoles) {
      const displayName = PROJECT_ROLE_DISPLAY_NAMES[role.name] || role.name;
      await db.$queryRaw`
        UPDATE "project_roles"
        SET "code_temp" = ${role.name},
            "displayName_temp" = ${displayName}
        WHERE id = ${role.id}
      `;
      console.log(`  - 迁移项目角色: ${role.name} -> displayName: ${displayName}`);
    }

    // 4. 删除旧的 name 字段
    console.log('步骤 4: 删除旧的 name 字段...');
    try {
      await db.$queryRaw`ALTER TABLE "roles" DROP COLUMN IF EXISTS "name"`;
      await db.$queryRaw`ALTER TABLE "project_roles" DROP COLUMN IF EXISTS "name"`;
    } catch (error) {
      console.log('  - 可能已删除或不存在');
    }

    // 5. 重命名临时字段为正式字段
    console.log('步骤 5: 重命名字段...');
    await db.$queryRaw`ALTER TABLE "roles" RENAME COLUMN "code_temp" TO "code"`;
    await db.$queryRaw`ALTER TABLE "roles" RENAME COLUMN "displayName_temp" TO "displayName"`;
    await db.$queryRaw`ALTER TABLE "project_roles" RENAME COLUMN "code_temp" TO "code"`;
    await db.$queryRaw`ALTER TABLE "project_roles" RENAME COLUMN "displayName_temp" TO "displayName"`;

    // 6. 添加唯一约束
    console.log('步骤 6: 添加唯一约束...');
    try {
      await db.$queryRaw`ALTER TABLE "roles" ADD UNIQUE IF NOT EXISTS "roles_code_parentId_key" ("code", "parentId")`;
      await db.$queryRaw`ALTER TABLE "project_roles" ADD UNIQUE IF NOT EXISTS "project_roles_code_projectId_key" ("code", "projectId")`;
    } catch (error) {
      console.log('  - 约束可能已存在');
    }

    console.log('角色数据迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// 运行迁移
migrateRoles()
  .then(() => {
    console.log('迁移脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('迁移脚本执行失败:', error);
    process.exit(1);
  });