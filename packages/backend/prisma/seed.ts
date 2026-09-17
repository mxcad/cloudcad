import 'dotenv/config';
import {
  PrismaClient,
  Prisma,
  Permission,
  ProjectPermission,
} from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ProjectRole as ProjectRoleEnum,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  SystemRole,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LEVELS,
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

// 系统角色权限定义来源于 SYSTEM_ROLE_PERMISSIONS（@cloudcad/contracts 单一来源），
// 不再在此内联维护 SYSTEM_PERMISSIONS / rolePermissionRules，避免与角色权限定义漂移

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

  // 定义所有系统角色（权限/层级均来源于 @cloudcad/contracts 单一来源）
  const systemRoles = [
    {
      name: SystemRole.ADMIN,
      description: '系统管理员，拥有所有权限',
      level: SYSTEM_ROLE_LEVELS[SystemRole.ADMIN],
      permissions: SYSTEM_ROLE_PERMISSIONS[SystemRole.ADMIN],
    },
    {
      name: SystemRole.AUDIT_ADMIN,
      description:
        '审计管理员，管理审计数据（查询/导出/清理），三权分立（等保 8.5.2）',
      level: SYSTEM_ROLE_LEVELS[SystemRole.AUDIT_ADMIN],
      permissions: SYSTEM_ROLE_PERMISSIONS[SystemRole.AUDIT_ADMIN],
    },
    {
      name: SystemRole.USER_MANAGER,
      description: '用户管理员，管理系统用户和角色',
      level: SYSTEM_ROLE_LEVELS[SystemRole.USER_MANAGER],
      permissions: SYSTEM_ROLE_PERMISSIONS[SystemRole.USER_MANAGER],
    },
    {
      name: SystemRole.FONT_MANAGER,
      description: '字体管理员，管理系统字体库',
      level: SYSTEM_ROLE_LEVELS[SystemRole.FONT_MANAGER],
      permissions: SYSTEM_ROLE_PERMISSIONS[SystemRole.FONT_MANAGER],
    },
    {
      name: SystemRole.USER,
      description: '普通用户，基础权限',
      level: SYSTEM_ROLE_LEVELS[SystemRole.USER],
      permissions: SYSTEM_ROLE_PERMISSIONS[SystemRole.USER],
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

  // 初始管理员账户由后端 initialization.service 单一来源创建（onModuleInit →
  // checkAndCreateInitialAdmin，密码取部署生成的 INITIAL_ADMIN_PASSWORD，并打首登改密标记）。
  // seed 不再建 admin：此前 seed 用 ADMIN_PASSWORD（缺省 Admin@123）抢先建 admin，
  // 后端见 userCount>0 即跳过，导致部署生成的 INITIAL_ADMIN_PASSWORD 落空、无法登录。

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
    {
      key: 'quota.personal_storage_mb',
      type: 'number',
      label: '个人空间容量(MB)',
      defaultValue: 50,
      description: '用户个人私人空间的上限，单位 MB',
      sortOrder: 1,
    },
    {
      key: 'quota.conversion_window_count',
      type: 'number',
      label: '每窗口转换次数',
      defaultValue: 10,
      description: '每窗口内图纸格式转换次数上限（PDF/DXF/DWG 统一计数）',
      sortOrder: 2,
    },
    {
      key: 'quota.conversion_window_hours',
      type: 'number',
      label: '转换窗口(小时)',
      defaultValue: 2,
      description: '转换频率限制窗口小时数',
      sortOrder: 3,
    },
    {
      key: 'quota.save_window_count',
      type: 'number',
      label: '每窗口保存次数',
      defaultValue: 300,
      description:
        '每窗口内图纸覆盖保存（转 bin）次数上限，窗口小时数复用转换窗口',
      sortOrder: 4,
    },
    {
      key: 'quota.history_window_count',
      type: 'number',
      label: '每窗口历史版本查看次数',
      defaultValue: 300,
      description:
        '每窗口内查看图纸历史版本（bin 转 mxweb）次数上限，窗口小时数复用转换窗口',
      sortOrder: 5,
    },
    {
      key: 'quota.project_size_mb',
      type: 'number',
      label: '项目体积上限(MB)',
      defaultValue: 100,
      description: '用户可参与的项目的最大体积，逐项目独立计算',
      sortOrder: 6,
    },
    {
      key: 'quota.max_projects',
      type: 'number',
      label: '最大创建项目数',
      defaultValue: 5,
      description: '用户最多可创建的项目总数',
      sortOrder: 7,
    },
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
    {
      level: 0,
      name: 'VIP0',
      baseMonthlyPrice: 0,
      isActive: true,
      configs: {
        'quota.personal_storage_mb': 50,
        'quota.conversion_window_count': 10,
        'quota.conversion_window_hours': 2,
        'quota.save_window_count': 300,
        'quota.history_window_count': 300,
        'quota.project_size_mb': 100,
        'quota.max_projects': 5,
      },
    },
    {
      level: 1,
      name: 'VIP1',
      baseMonthlyPrice: 1500,
      isActive: true,
      configs: {
        'quota.personal_storage_mb': 200,
        'quota.conversion_window_count': 100,
        'quota.conversion_window_hours': 2,
        'quota.save_window_count': 500,
        'quota.history_window_count': 500,
        'quota.project_size_mb': 500,
        'quota.max_projects': 20,
      },
    },
    {
      level: 2,
      name: 'VIP2',
      baseMonthlyPrice: 3000,
      isActive: true,
      configs: {
        'quota.personal_storage_mb': 500,
        'quota.conversion_window_count': 1000,
        'quota.conversion_window_hours': 2,
        'quota.save_window_count': 2000,
        'quota.history_window_count': 2000,
        'quota.project_size_mb': 2000,
        'quota.max_projects': 50,
      },
    },
    {
      level: 3,
      name: 'VIP3',
      baseMonthlyPrice: 6000,
      isActive: true,
      configs: {
        'quota.personal_storage_mb': 2000,
        'quota.conversion_window_count': 5000,
        'quota.conversion_window_hours': 2,
        'quota.save_window_count': 5000,
        'quota.history_window_count': 5000,
        'quota.project_size_mb': 10000,
        'quota.max_projects': 200,
      },
    },
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

  const existing = await prisma.durationPricing.findMany({
    select: { months: true },
  });
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
