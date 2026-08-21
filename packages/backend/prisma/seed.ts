import 'dotenv/config';
import {
  PrismaClient,
  Prisma,
  Permission,
  ProjectPermission,
  UserStatus,
} from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ProjectRole as ProjectRoleEnum,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '@cloudcad/contracts';

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
  Permission.SYSTEM_USER_MEMBERSHIP_MANAGE,
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
  Permission.SYSTEM_BILLING_READ,
  Permission.SYSTEM_BILLING_WRITE,
  Permission.SYSTEM_MONITOR,
  Permission.SYSTEM_CONFIG_READ,
  Permission.SYSTEM_CONFIG_WRITE,
  Permission.SYSTEM_IP_BLACKLIST_MANAGE,
  Permission.SYSTEM_IP_WHITELIST_MANAGE,
  Permission.LIBRARY_DRAWING_MANAGE,
  Permission.LIBRARY_BLOCK_MANAGE,
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

  // 创建项目角色模板（isSystem=true, projectId=null；ADR-00XX：项目创建时复制为项目副本）。
  // 与初始化服务 createProjectDefaultRoles 对齐：5 个默认角色 + 权限映射
  // （此前仅 4 个且无权限，属漂移）。
  console.log('处理项目系统角色...');
  const projectSystemRoles = [
    { name: ProjectRoleEnum.OWNER, description: '项目所有者，拥有最高权限' },
    { name: ProjectRoleEnum.ADMIN, description: '项目管理员，可管理项目设置' },
    { name: ProjectRoleEnum.EDITOR, description: '项目编辑者，可编辑文件' },
    { name: ProjectRoleEnum.MEMBER, description: '项目成员，可查看和编辑文件' },
    { name: ProjectRoleEnum.VIEWER, description: '项目查看者，仅可查看文件' },
  ];

  for (const roleConfig of projectSystemRoles) {
    const existingRole = await prisma.projectRole.findFirst({
      where: { name: roleConfig.name, projectId: null },
    });

    if (!existingRole) {
      const role = await prisma.projectRole.create({
        data: {
          name: roleConfig.name,
          description: roleConfig.description,
          isSystem: true,
        },
      });
      // 写入默认权限映射（与初始化播种一致）
      const permissions =
        DEFAULT_PROJECT_ROLE_PERMISSIONS[roleConfig.name] || [];
      if (permissions.length > 0) {
        await prisma.projectRolePermission.createMany({
          data: permissions.map((permission) => ({
            projectRoleId: role.id,
            permission: permission as ProjectPermission,
          })),
          skipDuplicates: true,
        });
      }
      console.log(`  项目角色 ${roleConfig.name} 已创建`);
    } else {
      console.log(`  项目角色 ${roleConfig.name} 已存在，跳过创建`);
    }
  }

  // 创建默认管理员账户（如果不存在）
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cloudcad.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  
  console.log('处理管理员账户...');
  
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: adminEmail },
        { username: 'admin' }
      ]
    }
  });
  
  if (existingAdmin) {
    console.log('  管理员账户已存在，跳过创建');
  } else {
    // 查找 ADMIN 角色
    const adminRole = await prisma.role.findFirst({
      where: { name: 'ADMIN' }
    });
    
    if (!adminRole) {
      console.error('  错误：未找到 ADMIN 角色');
      return;
    }
    
    // 哈希密码
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // 创建管理员账户
    await prisma.user.create({
      data: {
        username: 'admin',
        email: adminEmail,
        password: hashedPassword,
        nickname: '系统管理员',
        roleId: adminRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        provider: 'LOCAL'
      }
    });
    
    console.log('  管理员账户已创建');
    console.log(`  邮箱: ${adminEmail}`);
    console.log(`  密码: ${adminPassword}`);
  }

  // 创建 VIP 体系种子数据
  await seedConfigKeyRegistry(prisma);
  await seedVipTiers(prisma);
  await seedDurationPricings(prisma);

  console.log('种子数据初始化完成!');
}

async function seedConfigKeyRegistry(prisma: PrismaClient) {
  // ADR-0043：旧「每日转换次数」键废弃，迁移为窗口频率限制两个键
  await prisma.configKeyRegistry.deleteMany({
    where: { key: 'quota.daily_conversion_count' },
  });

  const keys = [
    { key: 'quota.personal_storage_mb', type: 'number', label: '个人空间容量(MB)', defaultValue: 50, description: '用户个人私人空间的上限，单位 MB', sortOrder: 1 },
    { key: 'quota.conversion_window_count', type: 'number', label: '每窗口转换次数', defaultValue: 10, description: '每窗口内图纸格式转换次数上限（PDF/DXF/DWG 统一计数）', sortOrder: 2 },
    { key: 'quota.conversion_window_hours', type: 'number', label: '转换窗口(小时)', defaultValue: 2, description: '转换频率限制窗口小时数', sortOrder: 3 },
    { key: 'quota.save_window_count', type: 'number', label: '每窗口保存次数', defaultValue: 300, description: '每窗口内图纸覆盖保存（转 bin）次数上限，窗口小时数复用转换窗口', sortOrder: 4 },
    { key: 'quota.history_window_count', type: 'number', label: '每窗口历史版本查看次数', defaultValue: 300, description: '每窗口内查看图纸历史版本（bin 转 mxweb）次数上限，窗口小时数复用转换窗口', sortOrder: 5 },
    { key: 'quota.project_size_mb', type: 'number', label: '项目体积上限(MB)', defaultValue: 100, description: '用户可参与的项目的最大体积，逐项目独立计算', sortOrder: 6 },
    { key: 'quota.max_projects', type: 'number', label: '最大创建项目数', defaultValue: 5, description: '用户最多可创建的项目总数', sortOrder: 7 },
  ];

  // 按 key 幂等补齐：已有配置不覆盖，缺失配置才创建
  for (const item of keys) {
    await prisma.configKeyRegistry.upsert({
      where: { key: item.key },
      update: {},
      create: item,
    });
  }
  console.log('  ✓ config key registry up-to-date');
}

async function seedVipTiers(prisma: PrismaClient) {
  const tiers = [
    { level: 0, name: 'VIP0', baseMonthlyPrice: 0, isActive: true, configs: { 'quota.personal_storage_mb': 50, 'quota.conversion_window_count': 10, 'quota.conversion_window_hours': 2, 'quota.save_window_count': 300, 'quota.history_window_count': 300, 'quota.project_size_mb': 100, 'quota.max_projects': 5 } },
    { level: 1, name: 'VIP1', baseMonthlyPrice: 1500, isActive: true, configs: { 'quota.personal_storage_mb': 200, 'quota.conversion_window_count': 100, 'quota.conversion_window_hours': 2, 'quota.save_window_count': 500, 'quota.history_window_count': 500, 'quota.project_size_mb': 500, 'quota.max_projects': 20 } },
    { level: 2, name: 'VIP2', baseMonthlyPrice: 3000, isActive: true, configs: { 'quota.personal_storage_mb': 500, 'quota.conversion_window_count': 1000, 'quota.conversion_window_hours': 2, 'quota.save_window_count': 2000, 'quota.history_window_count': 2000, 'quota.project_size_mb': 2000, 'quota.max_projects': 50 } },
    { level: 3, name: 'VIP3', baseMonthlyPrice: 6000, isActive: true, configs: { 'quota.personal_storage_mb': 2000, 'quota.conversion_window_count': 5000, 'quota.conversion_window_hours': 2, 'quota.save_window_count': 5000, 'quota.history_window_count': 5000, 'quota.project_size_mb': 10000, 'quota.max_projects': 200 } },
  ];

  // 按 level 幂等补齐：已有等级不覆盖，缺失等级才创建
  for (const tier of tiers) {
    await prisma.vipTier.upsert({
      where: { level: tier.level },
      update: { configs: tier.configs as Prisma.JsonObject },
      create: tier,
    });
  }
  console.log('  ✓ vip tiers up-to-date');
}

async function seedDurationPricings(prisma: PrismaClient) {
  const durations = [
    { months: 1, multiplierBps: 10000, label: '1个月', sortOrder: 1 },
    { months: 2, multiplierBps: 9700, label: '2个月', sortOrder: 2 },
    { months: 3, multiplierBps: 9500, label: '3个月', sortOrder: 3 },
    { months: 4, multiplierBps: 9200, label: '4个月', sortOrder: 4 },
    { months: 5, multiplierBps: 8900, label: '5个月', sortOrder: 5 },
    { months: 6, multiplierBps: 8600, label: '6个月', sortOrder: 6 },
    { months: 7, multiplierBps: 8400, label: '7个月', sortOrder: 7 },
    { months: 8, multiplierBps: 8100, label: '8个月', sortOrder: 8 },
    { months: 9, multiplierBps: 7800, label: '9个月', sortOrder: 9 },
    { months: 10, multiplierBps: 7500, label: '10个月', sortOrder: 10 },
    { months: 11, multiplierBps: 7300, label: '11个月', sortOrder: 11 },
    { months: 12, multiplierBps: 7000, label: '12个月', sortOrder: 12 },
  ];

  const existing = await prisma.durationPricing.findMany({ select: { months: true } });
  const existingMonths = new Set(existing.map((d) => d.months));
  const missing = durations.filter((d) => !existingMonths.has(d.months));

  if (missing.length === 0) {
    console.log('  ✓ duration pricings up-to-date');
    return;
  }

  await prisma.durationPricing.createMany({
    data: missing.map((d) => ({ ...d, isActive: true })),
    skipDuplicates: true,
  });
  console.log(`  ✓ duration pricings seeded (+${missing.length})`);
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
