/**
 * 数据迁移脚本：将权限值从小写冒号格式迁移到大写下划线格式
 *
 * 运行方式：
 * pnpm ts-node scripts/migrate-permissions.ts
 */

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

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({ adapter });

// 权限映射表：旧格式 -> 新格式
const PERMISSION_MIGRATION_MAP: Record<string, string> = {
  // 系统权限
  'system:user:read': 'USER_READ',
  'system:user:create': 'USER_CREATE',
  'system:user:update': 'USER_UPDATE',
  'system:user:delete': 'USER_DELETE',
  'system:role:read': 'ROLE_READ',
  'system:role:create': 'ROLE_CREATE',
  'system:role:update': 'ROLE_UPDATE',
  'system:role:delete': 'ROLE_DELETE',
  'system:role:permission:manage': 'ROLE_PERMISSION_MANAGE',
  'system:font:read': 'FONT_READ',
  'system:font:upload': 'FONT_UPLOAD',
  'system:font:delete': 'FONT_DELETE',
  'system:font:download': 'FONT_DOWNLOAD',
  'system:admin': 'SYSTEM_ADMIN',
  'system:monitor': 'SYSTEM_MONITOR',

  // 项目权限
  'project:project:create': 'PROJECT_CREATE',
  'project:project:read': 'PROJECT_READ',
  'project:project:update': 'PROJECT_UPDATE',
  'project:project:delete': 'PROJECT_DELETE',
  'project:member:manage': 'PROJECT_MEMBER_MANAGE',
  'project:member:assign': 'PROJECT_MEMBER_ASSIGN',
  'project:role:manage': 'PROJECT_ROLE_MANAGE',
  'project:role:permission:manage': 'PROJECT_ROLE_PERMISSION_MANAGE',
  'project:project:transfer': 'PROJECT_TRANSFER',
  'project:file:create': 'FILE_CREATE',
  'project:file:upload': 'FILE_UPLOAD',
  'project:file:open': 'FILE_OPEN',
  'project:file:edit': 'FILE_EDIT',
  'project:file:delete': 'FILE_DELETE',
  'project:file:trash:manage': 'FILE_TRASH_MANAGE',
  'project:file:download': 'FILE_DOWNLOAD',
  'project:file:share': 'FILE_SHARE',
  'project:file:comment': 'FILE_COMMENT',
  'project:file:print': 'FILE_PRINT',
  'project:file:compare': 'FILE_COMPARE',
  'project:cad:save': 'CAD_SAVE',
  'project:cad:export': 'CAD_EXPORT',
  'project:cad:external_reference': 'CAD_EXTERNAL_REFERENCE',
  'project:gallery:use': 'GALLERY_USE',
  'project:gallery:add': 'GALLERY_ADD',
  'project:version:read': 'VERSION_READ',
  'project:version:create': 'VERSION_CREATE',
  'project:version:delete': 'VERSION_DELETE',
  'project:version:restore': 'VERSION_RESTORE',
  'project:settings:manage': 'PROJECT_SETTINGS_MANAGE',
};

async function migratePermissions() {
  console.log('🚀 开始迁移权限数据...\n');

  try {
    // 获取所有角色权限
    const rolePermissions = await prisma.rolePermission.findMany();

    if (rolePermissions.length === 0) {
      console.log('✅ 没有需要迁移的权限数据');
      return;
    }

    console.log(`📊 找到 ${rolePermissions.length} 条权限记录\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    // 迁移角色权限
    for (const rp of rolePermissions) {
      const oldPermission = rp.permission;
      const newPermission = PERMISSION_MIGRATION_MAP[oldPermission];

      if (newPermission) {
        await prisma.rolePermission.update({
          where: { id: rp.id },
          data: { permission: newPermission as any },
        });
        console.log(`✅ 迁移: ${oldPermission} -> ${newPermission}`);
        migratedCount++;
      } else {
        // 如果权限已经在正确格式，跳过
        if (!oldPermission.includes(':')) {
          console.log(`⏭️  跳过: ${oldPermission} (已是新格式)`);
          skippedCount++;
        } else {
          console.warn(`⚠️  未找到映射: ${oldPermission}`);
          notFoundCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 迁移统计:');
    console.log(`  ✅ 成功: ${migratedCount}`);
    console.log(`  ⏭️  跳过: ${skippedCount}`);
    console.log(`  ⚠️  未找到映射: ${notFoundCount}`);
    console.log(`  📊 总计: ${rolePermissions.length}`);
    console.log('='.repeat(50));

    if (notFoundCount > 0) {
      console.log('\n⚠️  部分权限未找到映射，请检查日志');
      process.exit(1);
    } else {
      console.log('\n✅ 所有权限迁移完成！');
    }
  } catch (error) {
    console.error('\n❌ 迁移过程出错:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
migratePermissions();