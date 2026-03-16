import 'dotenv/config';
import { PrismaClient, Permission } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 手动构建DATABASE_URL，确保格式正确
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'password';
const dbDatabase = process.env.DB_DATABASE || 'cloudcad';

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

/**
 * 系统权限定义（与 schema.prisma 中的 Permission 枚举一致）
 */
const SYSTEM_PERMISSIONS: Permission[] = [
  Permission.SYSTEM_USER_READ,
  Permission.SYSTEM_USER_CREATE,
  Permission.SYSTEM_USER_UPDATE,
  Permission.SYSTEM_USER_DELETE,
  Permission.SYSTEM_ROLE_READ,
  Permission.SYSTEM_ROLE_CREATE,
  Permission.SYSTEM_ROLE_UPDATE,
  Permission.SYSTEM_ROLE_DELETE,
  Permission.SYSTEM_ROLE_PERMISSION_MANAGE,
  Permission.SYSTEM_FONT_READ,
  Permission.SYSTEM_FONT_UPLOAD,
  Permission.SYSTEM_FONT_DELETE,
  Permission.SYSTEM_FONT_DOWNLOAD,
  Permission.SYSTEM_ADMIN,
  Permission.SYSTEM_MONITOR,
  Permission.SYSTEM_CONFIG_READ,
  Permission.SYSTEM_CONFIG_WRITE,
];

/**
 * 角色权限配置规则 - 与 SYSTEM_ROLE_PERMISSIONS 保持一致
 */
const rolePermissionRules = {
  // 系统管理员：所有权限
  admin: SYSTEM_PERMISSIONS,

  // 用户管理员：用户和角色管理权限
  user_manager: [
    Permission.SYSTEM_USER_READ,
    Permission.SYSTEM_USER_CREATE,
    Permission.SYSTEM_USER_UPDATE,
    Permission.SYSTEM_USER_DELETE,
    Permission.SYSTEM_ROLE_READ,
    Permission.SYSTEM_ROLE_CREATE,
    Permission.SYSTEM_ROLE_UPDATE,
    Permission.SYSTEM_ROLE_DELETE,
    Permission.SYSTEM_ROLE_PERMISSION_MANAGE,
  ],

  // 字体管理员：字体管理权限
  font_manager: [
    Permission.SYSTEM_FONT_READ,
    Permission.SYSTEM_FONT_UPLOAD,
    Permission.SYSTEM_FONT_DELETE,
    Permission.SYSTEM_FONT_DOWNLOAD,
  ],

  // 普通用户：无系统权限
  user: [] as Permission[],
};

/**
 * 为角色分配权限（先删除旧权限，再创建新权限）
 */
async function assignPermissionsToRole(
  roleId: string,
  permissions: Permission[]
): Promise<void> {
  // 先删除该角色的所有现有权限
  await prisma.rolePermission.deleteMany({
    where: { roleId },
  });

  // 再创建新权限
  if (permissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissions.map((perm) => ({
        roleId,
        permission: perm,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`✓ 角色权限配置完成 (${permissions.length} 个权限)`);
}

async function main() {
  console.log('开始种子数据初始化...');

  // 定义所有系统角色
  const systemRoles = [
    {
      name: 'ADMIN',
      description: '系统管理员，拥有所有权限',
      level: 100,
      permissions: rolePermissionRules.admin,
    },
    {
      name: 'USER_MANAGER',
      description: '用户管理员，管理系统用户和角色',
      level: 50,
      permissions: rolePermissionRules.user_manager,
    },
    {
      name: 'FONT_MANAGER',
      description: '字体管理员，管理系统字体库',
      level: 50,
      permissions: rolePermissionRules.font_manager,
    },
    {
      name: 'USER',
      description: '普通用户，基础权限',
      level: 0,
      permissions: rolePermissionRules.user,
    },
  ];

  // 创建或更新所有系统角色
  for (const roleConfig of systemRoles) {
    console.log(`处理角色: ${roleConfig.name}`);

    const existingRole = await prisma.role.findFirst({
      where: { name: roleConfig.name },
    });

    let role;
    if (existingRole) {
      // 更新现有角色
      role = await prisma.role.update({
        where: { id: existingRole.id },
        data: {
          description: roleConfig.description,
          level: roleConfig.level,
          isSystem: true,
          category: 'SYSTEM',
        },
      });
      console.log(`  角色已存在，已更新`);
    } else {
      // 创建新角色
      role = await prisma.role.create({
        data: {
          name: roleConfig.name,
          description: roleConfig.description,
          level: roleConfig.level,
          isSystem: true,
          category: 'SYSTEM',
        },
      });
      console.log(`  角色已创建`);
    }

    // 分配权限
    await assignPermissionsToRole(role.id, roleConfig.permissions);
  }

  console.log('种子数据初始化完成!');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
