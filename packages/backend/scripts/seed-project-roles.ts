import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ProjectPermission } from '@prisma/client';

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

// 默认项目角色定义
const DEFAULT_PROJECT_ROLES = [
  {
    name: 'PROJECT_OWNER',
    description: '项目所有者，拥有所有项目权限',
    permissions: [
      ProjectPermission.PROJECT_CREATE,
      ProjectPermission.PROJECT_READ,
      ProjectPermission.PROJECT_UPDATE,
      ProjectPermission.PROJECT_DELETE,
      ProjectPermission.PROJECT_MEMBER_MANAGE,
      ProjectPermission.PROJECT_MEMBER_ASSIGN,
      ProjectPermission.PROJECT_ROLE_MANAGE,
      ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
      ProjectPermission.PROJECT_TRANSFER,
      ProjectPermission.PROJECT_SETTINGS_MANAGE,
      ProjectPermission.FILE_CREATE,
      ProjectPermission.FILE_UPLOAD,
      ProjectPermission.FILE_OPEN,
      ProjectPermission.FILE_EDIT,
      ProjectPermission.FILE_DELETE,
      ProjectPermission.FILE_TRASH_MANAGE,
      ProjectPermission.FILE_DOWNLOAD,
      ProjectPermission.FILE_SHARE,
      ProjectPermission.CAD_SAVE,
      ProjectPermission.CAD_EXPORT,
      ProjectPermission.CAD_EXTERNAL_REFERENCE,
      ProjectPermission.GALLERY_USE,
      ProjectPermission.GALLERY_ADD,
      ProjectPermission.VERSION_READ,
      ProjectPermission.VERSION_CREATE,
      ProjectPermission.VERSION_DELETE,
      ProjectPermission.VERSION_RESTORE,
    ],
  },
  {
    name: 'PROJECT_ADMIN',
    description: '项目管理员，可以管理项目和成员',
    permissions: [
      ProjectPermission.PROJECT_READ,
      ProjectPermission.PROJECT_UPDATE,
      ProjectPermission.PROJECT_MEMBER_MANAGE,
      ProjectPermission.PROJECT_MEMBER_ASSIGN,
      ProjectPermission.PROJECT_SETTINGS_MANAGE,
      ProjectPermission.FILE_CREATE,
      ProjectPermission.FILE_UPLOAD,
      ProjectPermission.FILE_OPEN,
      ProjectPermission.FILE_EDIT,
      ProjectPermission.FILE_DELETE,
      ProjectPermission.FILE_TRASH_MANAGE,
      ProjectPermission.FILE_DOWNLOAD,
      ProjectPermission.FILE_SHARE,
      ProjectPermission.CAD_SAVE,
      ProjectPermission.CAD_EXPORT,
      ProjectPermission.CAD_EXTERNAL_REFERENCE,
      ProjectPermission.GALLERY_USE,
      ProjectPermission.GALLERY_ADD,
      ProjectPermission.VERSION_READ,
      ProjectPermission.VERSION_CREATE,
      ProjectPermission.VERSION_DELETE,
      ProjectPermission.VERSION_RESTORE,
    ],
  },
  {
    name: 'PROJECT_MEMBER',
    description: '项目成员，可以编辑文件和协作',
    permissions: [
      ProjectPermission.PROJECT_READ,
      ProjectPermission.FILE_CREATE,
      ProjectPermission.FILE_UPLOAD,
      ProjectPermission.FILE_OPEN,
      ProjectPermission.FILE_EDIT,
      ProjectPermission.FILE_DELETE,
      ProjectPermission.FILE_DOWNLOAD,
      ProjectPermission.FILE_SHARE,
      ProjectPermission.CAD_SAVE,
      ProjectPermission.CAD_EXPORT,
      ProjectPermission.GALLERY_USE,
      ProjectPermission.GALLERY_ADD,
      ProjectPermission.VERSION_READ,
    ],
  },
  {
    name: 'PROJECT_EDITOR',
    description: '项目编辑者，专注于文件编辑',
    permissions: [
      ProjectPermission.PROJECT_READ,
      ProjectPermission.FILE_UPLOAD,
      ProjectPermission.FILE_OPEN,
      ProjectPermission.FILE_EDIT,
      ProjectPermission.FILE_DELETE,
      ProjectPermission.FILE_DOWNLOAD,
      ProjectPermission.CAD_SAVE,
      ProjectPermission.CAD_EXPORT,
      ProjectPermission.GALLERY_USE,
      ProjectPermission.VERSION_READ,
      ProjectPermission.VERSION_CREATE,
    ],
  },
  {
    name: 'PROJECT_VIEWER',
    description: '项目查看者，只读权限',
    permissions: [
      ProjectPermission.PROJECT_READ,
      ProjectPermission.FILE_OPEN,
      ProjectPermission.FILE_DOWNLOAD,
      ProjectPermission.CAD_EXPORT,
      ProjectPermission.GALLERY_USE,
      ProjectPermission.VERSION_READ,
    ],
  },
];

async function main() {
  console.log('开始初始化默认项目角色...');

  // 获取管理员用户作为项目角色的创建者
  const admin = await prisma.user.findFirst({
    where: { email: 'admin@cloucad.com' },
  });

  if (!admin) {
    console.error('未找到管理员用户，请先运行 seed.ts');
    process.exit(1);
  }

  console.log(`使用管理员用户作为项目角色创建者: ${admin.username}`);

  for (const roleConfig of DEFAULT_PROJECT_ROLES) {
    console.log(`\n处理项目角色: ${roleConfig.name}`);

    // 检查角色是否已存在
    const existingRole = await prisma.projectRole.findUnique({
      where: { name: roleConfig.name },
    });

    if (existingRole) {
      console.log(`  ✓ 角色已存在，跳过创建`);
      continue;
    }

    // 创建项目角色
    const role = await prisma.projectRole.create({
      data: {
        ownerId: admin.id,
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: true, // 标记为系统默认角色
      },
    });

    console.log(`  ✓ 创建角色: ${role.name} (ID: ${role.id})`);

    // 分配权限
    for (const permission of roleConfig.permissions) {
      await prisma.projectRolePermission.create({
        data: {
          projectRoleId: role.id,
          permission: permission as any,
        },
      });
    }

    console.log(`  ✓ 权限分配完成 (${roleConfig.permissions.length} 个权限)`);
  }

  console.log('\n✓ 默认项目角色初始化完成!');
  console.log('\n已创建以下项目角色:');
  console.log('  - PROJECT_OWNER (项目所有者)');
  console.log('  - PROJECT_ADMIN (项目管理员)');
  console.log('  - PROJECT_MEMBER (项目成员)');
  console.log('  - PROJECT_EDITOR (项目编辑者)');
  console.log('  - PROJECT_VIEWER (项目查看者)');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
