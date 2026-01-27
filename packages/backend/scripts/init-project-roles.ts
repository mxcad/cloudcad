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

console.log('数据库连接URL:', databaseUrl.replace(/:[^:@]*@/, ':***@')); // 隐藏密码的日志

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

// 权限定义（与后端枚举保持一致）
const PERMISSIONS = {
  // 用户权限
  USER_READ: 'USER_READ',
  USER_WRITE: 'USER_WRITE',
  USER_DELETE: 'USER_DELETE',
  USER_ADMIN: 'USER_ADMIN',

  // 项目权限
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_WRITE: 'PROJECT_WRITE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  PROJECT_ADMIN: 'PROJECT_ADMIN',
  PROJECT_MEMBER_MANAGE: 'PROJECT_MEMBER_MANAGE',

  // 文件权限
  FILE_CREATE: 'FILE_CREATE',
  FILE_READ: 'FILE_READ',
  FILE_WRITE: 'FILE_WRITE',
  FILE_DELETE: 'FILE_DELETE',
  FILE_SHARE: 'FILE_SHARE',
  FILE_DOWNLOAD: 'FILE_DOWNLOAD',
  FILE_COMMENT: 'FILE_COMMENT',
  FILE_PRINT: 'FILE_PRINT',
  FILE_COMPARE: 'FILE_COMPARE',

  // 版本管理权限
  VERSION_READ: 'VERSION_READ',
  VERSION_CREATE: 'VERSION_CREATE',
  VERSION_DELETE: 'VERSION_DELETE',
  VERSION_RESTORE: 'VERSION_RESTORE',

  // 字体管理权限
  FONT_MANAGE: 'FONT_MANAGE',

  // 审图配置权限
  REVIEW_CONFIG: 'REVIEW_CONFIG',

  // 回收站权限
  TRASH_MANAGE: 'TRASH_MANAGE',

  // 系统权限
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  SYSTEM_MONITOR: 'SYSTEM_MONITOR',
} as const;

// 项目角色权限映射
const PROJECT_ROLE_PERMISSIONS = {
  PROJECT_OWNER: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_ADMIN,
    PERMISSIONS.PROJECT_MEMBER_MANAGE,
    PERMISSIONS.FILE_CREATE,
    PERMISSIONS.FILE_READ,
    PERMISSIONS.FILE_WRITE,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_SHARE,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_COMMENT,
    PERMISSIONS.FILE_PRINT,
    PERMISSIONS.FILE_COMPARE,
    PERMISSIONS.VERSION_READ,
    PERMISSIONS.VERSION_CREATE,
    PERMISSIONS.VERSION_DELETE,
    PERMISSIONS.VERSION_RESTORE,
    PERMISSIONS.FONT_MANAGE,
    PERMISSIONS.REVIEW_CONFIG,
    PERMISSIONS.TRASH_MANAGE,
  ],
  PROJECT_ADMIN: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.PROJECT_MEMBER_MANAGE,
    PERMISSIONS.FILE_CREATE,
    PERMISSIONS.FILE_READ,
    PERMISSIONS.FILE_WRITE,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_SHARE,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_COMMENT,
    PERMISSIONS.FILE_PRINT,
    PERMISSIONS.FILE_COMPARE,
    PERMISSIONS.VERSION_READ,
    PERMISSIONS.VERSION_CREATE,
    PERMISSIONS.VERSION_DELETE,
    PERMISSIONS.VERSION_RESTORE,
    PERMISSIONS.FONT_MANAGE,
    PERMISSIONS.REVIEW_CONFIG,
    PERMISSIONS.TRASH_MANAGE,
  ],
  PROJECT_MEMBER: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.FILE_CREATE,
    PERMISSIONS.FILE_READ,
    PERMISSIONS.FILE_WRITE,
    PERMISSIONS.FILE_SHARE,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_COMMENT,
    PERMISSIONS.FILE_PRINT,
    PERMISSIONS.FILE_COMPARE,
    PERMISSIONS.VERSION_READ,
    PERMISSIONS.VERSION_CREATE,
  ],
  PROJECT_EDITOR: [
    PERMISSIONS.FILE_READ,
    PERMISSIONS.FILE_WRITE,
    PERMISSIONS.FILE_SHARE,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_COMMENT,
    PERMISSIONS.FILE_PRINT,
    PERMISSIONS.FILE_COMPARE,
    PERMISSIONS.VERSION_READ,
  ],
  PROJECT_VIEWER: [
    PERMISSIONS.FILE_READ,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_COMMENT,
  ],
};

async function main() {
  console.log('开始初始化项目角色权限...');

  // 获取项目角色
  const projectOwnerRole = await prisma.role.findUnique({
    where: { name: 'PROJECT_OWNER' },
  });

  const projectAdminRole = await prisma.role.findUnique({
    where: { name: 'PROJECT_ADMIN' },
  });

  const projectMemberRole = await prisma.role.findUnique({
    where: { name: 'PROJECT_MEMBER' },
  });

  const projectEditorRole = await prisma.role.findUnique({
    where: { name: 'PROJECT_EDITOR' },
  });

  const projectViewerRole = await prisma.role.findUnique({
    where: { name: 'PROJECT_VIEWER' },
  });

  if (
    !projectOwnerRole ||
    !projectAdminRole ||
    !projectMemberRole ||
    !projectEditorRole ||
    !projectViewerRole
  ) {
    console.error('项目角色不存在，请先运行 seed.ts 创建角色');
    process.exit(1);
  }

  // 为每个项目角色分配权限
  const roles = [
    {
      role: projectOwnerRole,
      permissions: PROJECT_ROLE_PERMISSIONS.PROJECT_OWNER,
    },
    {
      role: projectAdminRole,
      permissions: PROJECT_ROLE_PERMISSIONS.PROJECT_ADMIN,
    },
    {
      role: projectMemberRole,
      permissions: PROJECT_ROLE_PERMISSIONS.PROJECT_MEMBER,
    },
    {
      role: projectEditorRole,
      permissions: PROJECT_ROLE_PERMISSIONS.PROJECT_EDITOR,
    },
    {
      role: projectViewerRole,
      permissions: PROJECT_ROLE_PERMISSIONS.PROJECT_VIEWER,
    },
  ];

  for (const { role, permissions } of roles) {
    console.log(`\n处理角色: ${role.name}`);

    // 删除现有权限
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    // 添加新权限
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permission,
        },
      });
      console.log(`  ✓ 添加权限: ${permission}`);
    }

    console.log(
      `✓ 角色 ${role.name} 权限配置完成 (${permissions.length} 个权限)`
    );
  }

  console.log('\n项目角色权限初始化完成!');
}

main()
  .catch((e) => {
    console.error('项目角色权限初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
