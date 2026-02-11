import 'dotenv/config';
import { PrismaClient, UserStatus, Permission } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

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
];

/**
 * 角色权限配置规则
 */
const rolePermissionRules = {
  // 系统管理员：所有权限
  admin: SYSTEM_PERMISSIONS,

  // 普通用户：基础权限（当前为空，可根据需要添加）
  user: [] as Permission[],
};

/**
 * 为角色分配权限
 */
async function assignPermissionsToRole(
  roleId: string,
  permissions: Permission[]
): Promise<void> {
  for (const perm of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permission: {
          roleId,
          permission: perm,
        },
      },
      update: {},
      create: {
        roleId,
        permission: perm,
      },
    });
  }
  console.log(`✓ 角色权限配置完成 (${permissions.length} 个权限)`);
}

async function main() {
  console.log('开始种子数据初始化...');

  // 获取或创建默认角色
  let adminRole = await prisma.role.findFirst({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        name: 'ADMIN',
        description: '系统管理员，拥有所有权限',
        category: 'SYSTEM',
        level: 100,
        isSystem: true,
      },
    });
  }

  let userRole = await prisma.role.findFirst({
    where: { name: 'USER' },
  });

  if (!userRole) {
    userRole = await prisma.role.create({
      data: {
        name: 'USER',
        description: '普通用户，基础权限',
        category: 'SYSTEM',
        level: 0,
        isSystem: true,
      },
    });
  }

  console.log(
    '系统角色已准备:',
    adminRole.name,
    userRole.name
  );

  // 为角色分配权限
  console.log('开始为角色分配权限...');

  // ADMIN 权限（系统管理员）
  console.log('配置 ADMIN 权限...');
  await assignPermissionsToRole(adminRole.id, rolePermissionRules.admin);

  // USER 权限（普通用户）
  console.log('配置 USER 权限...');
  await assignPermissionsToRole(userRole.id, rolePermissionRules.user);

  // 创建管理员用户（管理员账号不需要邮箱验证）
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cloucad.com' },
    update: {},
    create: {
      email: 'admin@cloucad.com',
      username: 'admin',
      password: adminPassword,
      nickname: '系统管理员',
      roleId: adminRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('管理员用户已创建:', admin);

  // 创建测试用户
  const testPassword = await bcrypt.hash('Test123!', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@cloucad.com' },
    update: {},
    create: {
      email: 'test@cloucad.com',
      username: 'testuser',
      password: testPassword,
      nickname: '测试用户',
      roleId: userRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('测试用户已创建:', testUser);

  // 创建更多测试用户（用于分页功能测试）
  const users = [
    {
      email: 'zhangsan@cloucad.com',
      username: 'zhangsan',
      nickname: '张三',
      password: 'Zhang123!',
    },
    {
      email: 'lisi@cloucad.com',
      username: 'lisi',
      nickname: '李四',
      password: 'Li123!',
    },
    {
      email: 'wangwu@cloucad.com',
      username: 'wangwu',
      nickname: '王五',
      password: 'Wang123!',
    },
    {
      email: 'zhaoliu@cloucad.com',
      username: 'zhaoliu',
      nickname: '赵六',
      password: 'Zhao123!',
    },
    {
      email: 'qianqi@cloucad.com',
      username: 'qianqi',
      nickname: '钱七',
      password: 'Qian123!',
    },
  ];

  // 批量创建用户
  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        nickname: userData.nickname,
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`用户已创建: ${user.nickname} (${user.email})`);
  }

  // 创建批量测试用户（用于分页测试）
  const surnames = [
    '陈',
    '林',
    '黄',
    '周',
    '吴',
    '徐',
    '孙',
    '马',
    '朱',
    '胡',
    '郭',
    '何',
    '高',
    '罗',
    '梁',
  ];
  const names = [
    '明',
    '伟',
    '芳',
    '娜',
    '秀英',
    '敏',
    '静',
    '丽',
    '强',
    '磊',
    '军',
    '洋',
    '勇',
    '艳',
    '杰',
  ];

  for (let i = 1; i <= 43; i++) {
    const surname = surnames[i % surnames.length];
    const name = names[i % names.length];
    const nickname = `${surname}${name}${i}`;
    const username = `user${i}`;
    const email = `user${i}@cloucad.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        username,
        password: testPassword,
        nickname,
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`测试用户已创建: ${user.nickname} (${user.email})`);
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
