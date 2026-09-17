///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { PERSONAL_SPACE_NAME } from '../../personal-space/personal-space.service';
import {
  BlacklistSource,
  NodeType,
  Permission,
  ProjectPermission,
} from '@cloudcad/db';
import {
  SystemRole,
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LEVELS,
} from '../../common/enums/permissions.enum';
import {
  USER_SERVICE,
  IUserService,
} from '../../common/interfaces/user-service.interface';
import { RoleInheritanceService } from '../../permission/services/role-inheritance.service';
import { I18nContext } from 'nestjs-i18n';

/**
 * 首次启动默认写入的管理员白名单条目：IPv4 / IPv6 各一条 /0，等价「全局可访问」。
 *
 * 必须成对写入——cidrContains 要求版本一致（见 ip-blacklist.utils.ts），
 * 单独 0.0.0.0/0 不含纯 IPv6，会出现「以为已全放行」的半吊子状态。
 */
const DEFAULT_ADMIN_WHITELIST_IPS: string[] = ['0.0.0.0/0', '::/0'];

/**
 * 系统初始化服务
 *
 * 功能：
 * 1. 检查是否为首次启动（无任何用户）
 * 2. 首次启动时自动创建所有系统默认角色和项目默认角色
 * 3. 首次启动时自动创建管理员账户
 * 4. 后续访问禁止注册
 */
@Injectable()
export class InitializationService implements OnModuleInit {
  private readonly logger = new Logger(InitializationService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly roleInheritanceService: RoleInheritanceService,
    @Optional()
    @Inject(USER_SERVICE)
    private readonly userService?: IUserService
  ) {}

  /**
   * 模块初始化时执行
   * 优化：使用并行查询减少启动时间
   */
  async onModuleInit() {
    const startTime = Date.now();
    this.logger.log('开始系统初始化...');

    // 先清理历史遗留的同名系统角色重复行，否则后续 seed / 权限解析会命中随机行，
    // 导致「普通用户忽而是管理员、管理员忽而是普通用户」的权限漂移
    await this.dedupeSystemRoles();

    // 并行执行独立的初始化任务
    await Promise.all([
      this.createSystemDefaultRoles(),
      this.createProjectDefaultRoles(),
    ]);

    // 角色播种完成后，初始化系统角色层级关系（设置 parentId），
    // 并预热角色权限缓存，确保按角色查权限时继承关系正确
    await this.roleInheritanceService.initializeRoleHierarchy();
    for (const roleName of Object.values(SystemRole)) {
      await this.roleInheritanceService.forceRefreshRolePermissions(roleName);
    }

    // 串行执行有依赖的任务
    await this.checkAndCreateInitialAdmin();
    await this.ensureDefaultAdminIpWhitelist();
    await this.ensureAllUsersHavePersonalSpace();
    await this.ensurePublicLibraries();

    const duration = Date.now() - startTime;
    this.logger.log(`✅ 系统初始化完成，耗时 ${duration}ms`);
  }

  /**
   * 清理同名系统角色的重复行。
   *
   * 背景：Role.name 历史上没有唯一约束，seed / 手动操作可能产生多行同名的系统角色。
   * 权限解析使用 findFirst({ where: { name } }) 会随机命中其中一行，导致权限漂移。
   * 这里对每个系统角色名只保留 level 最高（最权威）的一行，把其余重复行的权限、
   * 用户引用、子角色 parentId 合并到保留行后删除。幂等、安全，可重复运行。
   */
  private async dedupeSystemRoles(): Promise<void> {
    try {
      for (const roleName of Object.values(SystemRole)) {
        const rows = await this.prisma.role.findMany({
          where: { name: roleName, isSystem: true },
          include: { permissions: true },
          orderBy: { level: 'desc' },
        });

        if (rows.length <= 1) {
          continue;
        }

        const keep = rows[0];
        const dups = rows.slice(1);
        const dupIds = dups.map((r) => r.id);

        // 合并重复行的权限到保留行
        const keepPerms = new Set(keep.permissions.map((p) => p.permission));
        const extra = dups
          .flatMap((r) => r.permissions)
          .filter((p) => !keepPerms.has(p.permission));
        if (extra.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: extra.map((p) => ({
              roleId: keep.id,
              permission: p.permission,
            })),
            skipDuplicates: true,
          });
        }

        // 把引用了重复行的子角色 parentId、用户 roleId 迁移到保留行
        await this.prisma.role.updateMany({
          where: { parentId: { in: dupIds } },
          data: { parentId: keep.id },
        });
        await this.prisma.user.updateMany({
          where: { roleId: { in: dupIds } },
          data: { roleId: keep.id },
        });

        // 删除重复行（先清其权限关联，再删行本身）
        await this.prisma.rolePermission.deleteMany({
          where: { roleId: { in: dupIds } },
        });
        await this.prisma.role.deleteMany({
          where: { id: { in: dupIds } },
        });

        this.logger.warn(
          `去重系统角色 ${roleName}: 保留行 ${keep.id}（level=${keep.level}），已删除 ${dupIds.length} 个重复行`
        );
      }
      this.logger.log('✅ 系统角色去重完成');
    } catch (error) {
      this.logger.error('系统角色去重失败', error);
      throw error;
    }
  }

  /**
   * 创建系统默认角色
   */
  private async createSystemDefaultRoles(): Promise<void> {
    try {
      // 权限定义来源于 SYSTEM_ROLE_PERMISSIONS（@cloudcad/contracts 单一来源），
      // 不再在此内联维护，避免与角色权限定义漂移
      const defaultRoles = [
        {
          name: SystemRole.ADMIN,
          description: '系统管理员，拥有所有权限',
        },
        {
          name: SystemRole.AUDIT_ADMIN,
          description:
            '审计管理员，管理审计数据（查询/导出/清理），三权分立（等保 8.5.2）',
        },
        {
          name: SystemRole.USER_MANAGER,
          description: '用户管理员，管理系统用户和角色',
        },
        {
          name: SystemRole.FONT_MANAGER,
          description: '字体管理员，管理系统字体库',
        },
        {
          name: SystemRole.USER,
          description: '普通用户，基本访问权限',
        },
      ];

      for (const roleConfig of defaultRoles) {
        // 权限定义来源于 SYSTEM_ROLE_PERMISSIONS（@cloudcad/contracts 单一来源）
        const expectedPermissions = SYSTEM_ROLE_PERMISSIONS[roleConfig.name];
        const existingRole = await this.prisma.role.findFirst({
          where: { name: roleConfig.name },
          orderBy: { level: 'desc' },
          include: { permissions: true },
        });

        if (existingRole) {
          // 权限审计：检测并警告权限不一致，但不强制同步
          const existingPerms = new Set<Permission>(
            existingRole.permissions.map((p) => p.permission as Permission)
          );
          const expectedPerms = new Set<Permission>(
            expectedPermissions.map((p) => p as Permission)
          );

          // 1. 检测并自动补充缺失的权限
          const missingPerms = expectedPermissions.filter(
            (p) => !existingPerms.has(p as Permission)
          );

          if (missingPerms.length > 0) {
            this.logger.warn(
              `⚠️  权限审计：系统角色 ${roleConfig.name} 缺少 ${missingPerms.length} 个默认权限: ${missingPerms.join(', ')}`
            );
            this.logger.warn(`   正在自动补充缺失的权限...`);

            await this.prisma.rolePermission.createMany({
              data: missingPerms.map((permission) => ({
                roleId: existingRole.id,
                permission: permission as Permission,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 系统角色 ${roleConfig.name} 已补充 ${missingPerms.length} 个默认权限`
            );
          }

          // 2. 检查并恢复关键权限（系统角色的核心权限不能被取消）
          const criticalPerms = this.getCriticalPermissions(roleConfig.name);
          const missingCriticalPerms = criticalPerms.filter(
            (p) => !existingPerms.has(p as Permission)
          );

          if (missingCriticalPerms.length > 0) {
            this.logger.warn(
              `⚠️  关键权限缺失：系统角色 ${roleConfig.name} 缺少关键权限: ${missingCriticalPerms.join(', ')}`
            );
            this.logger.warn(`   正在自动恢复关键权限...`);

            await this.prisma.rolePermission.createMany({
              data: missingCriticalPerms.map((permission) => ({
                roleId: existingRole.id,
                permission: permission as Permission,
              })),
              skipDuplicates: true,
            });

            this.logger.log(
              `✅ 系统角色 ${roleConfig.name} 已恢复 ${missingCriticalPerms.length} 个关键权限`
            );
          }

          // 3. 检测多余的权限（仅警告，不删除）
          const extraPerms = Array.from(existingPerms).filter(
            (p) => !expectedPerms.has(p)
          );

          if (extraPerms.length > 0) {
            this.logger.error(
              `⚠️  权限审计警告：系统角色 ${roleConfig.name} 有 ${extraPerms.length} 个非预期权限: ${extraPerms.join(', ')}`
            );
            this.logger.error(
              `   这可能是手动配置的权限。如果这是错误的配置，请手动删除。`
            );
          }

          // 4. 权限完全一致时输出日志
          if (missingPerms.length === 0 && extraPerms.length === 0) {
            this.logger.debug(
              `系统角色 ${roleConfig.name} 权限正常（${existingPerms.size} 个权限）`
            );
          }

          continue;
        }

        this.logger.log(`创建系统角色: ${roleConfig.name}`);

        const role = await this.prisma.role.create({
          data: {
            name: roleConfig.name,
            description: roleConfig.description,
            category: 'SYSTEM',
            isSystem: true,
            // 层级来源于 SYSTEM_ROLE_LEVELS（@cloudcad/contracts 单一来源，与 seed.ts 一致）
            level: SYSTEM_ROLE_LEVELS[roleConfig.name],
          },
        });

        await this.prisma.rolePermission.createMany({
          data: expectedPermissions.map((permission) => ({
            roleId: role.id,
            permission: permission as Permission,
          })),
          skipDuplicates: true,
        });

        this.logger.log(
          `✅ 系统角色 ${roleConfig.name} 创建成功，分配 ${expectedPermissions.length} 个权限`
        );
      }

      // 失效角色权限缓存，避免旧缓存（含启动竞态的空哨兵 / 重复角色行的错误解析）残留，
      // 下次按角色查权限时会用「category=SYSTEM + level 降序」的确定性查询重新解析
      for (const roleConfig of defaultRoles) {
        await this.roleInheritanceService.clearRoleCache(roleConfig.name);
      }
    } catch (error) {
      this.logger.error('创建系统默认角色失败', error);
      throw error;
    }
  }

  /**
   * 获取系统角色的关键权限（不能被取消的权限）
   */
  private getCriticalPermissions(roleName: string): string[] {
    switch (roleName) {
      case 'ADMIN':
        // 系统管理员必须拥有的权限配置相关权限
        return [
          'SYSTEM_ROLE_READ', // 查看角色
          'SYSTEM_ROLE_CREATE', // 创建角色
          'SYSTEM_ROLE_UPDATE', // 编辑角色
          'SYSTEM_ROLE_DELETE', // 删除角色
          'SYSTEM_ROLE_PERMISSION_MANAGE', // 角色权限管理
        ];
      default:
        return [];
    }
  }

  /**
   * 创建项目默认角色
   * 权限定义来源于 DEFAULT_PROJECT_ROLE_PERMISSIONS（唯一来源）
   */
  private async createProjectDefaultRoles(): Promise<void> {
    try {
      // 角色描述映射
      const roleDescriptions: Record<ProjectRole, string> = {
        [ProjectRole.OWNER]: '项目所有者，拥有项目的完整管理权限',
        [ProjectRole.ADMIN]: '项目管理员，管理项目和团队成员',
        [ProjectRole.MEMBER]: '项目成员，可以查看和编辑项目内容',
        [ProjectRole.EDITOR]: '项目编辑者，可以编辑项目文件',
        [ProjectRole.VIEWER]: '项目查看者，仅能查看项目内容',
      };

      // 遍历所有项目角色，使用 DEFAULT_PROJECT_ROLE_PERMISSIONS 作为唯一来源
      for (const [roleKey, permissions] of Object.entries(
        DEFAULT_PROJECT_ROLE_PERMISSIONS
      )) {
        const roleName = roleKey as ProjectRole;
        const description = roleDescriptions[roleName];
        const permissionStrings = permissions.map((p) => p as string);

        const existingRole = await this.prisma.projectRole.findFirst({
          where: {
            name: roleName,
            isSystem: true,
          },
          include: {
            permissions: true,
          },
        });

        if (existingRole) {
          // 权限审计：检测并警告权限不一致，但不强制同步
          const existingPerms = new Set<ProjectPermission>(
            existingRole.permissions.map(
              (p) => p.permission as ProjectPermission
            )
          );
          const expectedPerms = new Set<ProjectPermission>(
            permissionStrings.map((p) => p as ProjectPermission)
          );

          // 1. 检测缺失的权限（自动补充，确保系统角色与定义一致）
          const missingPerms = permissionStrings.filter(
            (p) => !existingPerms.has(p as ProjectPermission)
          );

          if (missingPerms.length > 0) {
            this.logger.log(
              `项目角色 ${roleName} 缺少 ${missingPerms.length} 个默认权限，正在自动补充: ${missingPerms.join(', ')}`
            );
            await this.prisma.projectRolePermission.createMany({
              data: missingPerms.map((permission) => ({
                projectRoleId: existingRole.id,
                permission: permission as ProjectPermission,
              })),
              skipDuplicates: true,
            });
            this.logger.log(
              `✅ 项目角色 ${roleName} 已自动补充 ${missingPerms.length} 个缺失权限`
            );
          }

          // 2. 检测多余的权限（仅警告，不删除）
          const extraPerms = Array.from(existingPerms).filter(
            (p) => !expectedPerms.has(p)
          );

          if (extraPerms.length > 0) {
            this.logger.error(
              `⚠️  权限审计警告：项目角色 ${roleName} 有 ${extraPerms.length} 个非预期权限: ${extraPerms.join(', ')}`
            );
            this.logger.error(
              `   这可能是手动配置的权限。如果这是错误的配置，请手动删除。`
            );
          }

          // 3. 权限完全一致时输出日志
          if (missingPerms.length === 0 && extraPerms.length === 0) {
            this.logger.debug(
              `项目角色 ${roleName} 权限正常（${existingPerms.size} 个权限）`
            );
          }

          continue;
        }

        this.logger.log(`创建项目角色: ${roleName}`);

        const role = await this.prisma.projectRole.create({
          data: {
            name: roleName,
            description,
            isSystem: true,
          },
        });

        await this.prisma.projectRolePermission.createMany({
          data: permissionStrings.map((permission) => ({
            projectRoleId: role.id,
            permission: permission as ProjectPermission,
          })),
          skipDuplicates: true,
        });

        this.logger.log(
          `✅ 项目角色 ${roleName} 创建成功，分配 ${permissions.length} 个权限`
        );
      }
    } catch (error) {
      this.logger.error('创建项目默认角色失败', error);
      throw error;
    }
  }

  /**
   * 检查并创建初始管理员账户
   */
  private async checkAndCreateInitialAdmin(): Promise<void> {
    try {
      // 检查是否已有用户
      const userCount = await this.prisma.user.count();

      if (userCount > 0) {
        this.logger.log(`系统已初始化，当前有 ${userCount} 个用户`);
        return;
      }

      this.logger.log('首次启动系统，开始创建初始管理员账户...');

      // 检查是否有 ADMIN 角色
      const adminRole = await this.prisma.role.findFirst({
        where: { name: SystemRole.ADMIN },
      });

      if (!adminRole) {
        throw new InternalServerErrorException(
          'ADMIN 角色不存在，请检查系统默认角色创建逻辑'
        );
      }

      // 创建初始管理员账户
      const adminEmail = this.configService.get<string>(
        'INITIAL_ADMIN_EMAIL',
        'admin@example.com'
      );
      const adminUsername = this.configService.get<string>(
        'INITIAL_ADMIN_USERNAME',
        'admin'
      );
      // #416 等保 8.1.4.1：INITIAL_ADMIN_PASSWORD env 必填无缺省——首次启动（无用户）时
      // 缺失则启动失败，不再有 Admin123! 缺省。部署工具（setup-offline/wizard）生成随机强口令写入 .env。
      const adminPassword = this.configService.get<string>(
        'INITIAL_ADMIN_PASSWORD'
      );
      if (!adminPassword) {
        throw new InternalServerErrorException(
          I18nContext.current()?.t(
            'error.initialization.admin_password_required'
          ) ??
            'INITIAL_ADMIN_PASSWORD 环境变量未设置，首次启动必须提供初始管理员密码'
        );
      }

      // 使用 IUserService 创建用户（会自动创建私人空间）
      if (!this.userService) {
        throw new Error('UserService 不可用，无法创建管理员账户');
      }
      const createdAdmin = await this.userService.create({
        email: adminEmail,
        username: adminUsername,
        password: adminPassword,
        nickname: '系统管理员',
        roleId: adminRole.id,
      });

      // #416 首登未改密标记：初始管理员创建后 passwordChangedAt 置 null（覆盖 create 默认写入的 now()），
      // 据此判定"首登未改密"强制改密。
      await this.prisma.user.update({
        where: { id: createdAdmin.id },
        data: { passwordChangedAt: null },
      });

      // 删除启动日志打印明文口令（#416 等保 8.1.4.1）：仅记录创建成功，不输出邮箱/用户名/密码
      this.logger.log(
        '✅ 初始管理员账户创建成功（请在首次登录后立即修改密码）'
      );
    } catch (error) {
      this.logger.error('创建初始管理员账户失败', error);
      throw error;
    }
  }

  /**
   * 首次启动写入默认管理员白名单条目（全局可访问）。
   *
   * 背景：白名单判定 fail-close，全新部署后白名单为空 → 管理员从任何非环回 IP
   * 都无法登录，只能 SSH 到服务器编辑 config/admin-ip-whitelist.json 自救。
   * 首次启动时插入全局放行条目消除该锁死，管理员后续可在 IP 访问控制页
   * 删除后按需添加受限网段。
   *
   * 一次性 + 幂等：仅首次启动（无任何用户）执行；同值条目已存在则跳过。
   * 升级部署与重启永不自动放宽——删除默认条目后不会在下次启动被重新插入。
   */
  private async ensureDefaultAdminIpWhitelist(): Promise<void> {
    try {
      const userCount = await this.prisma.user.count();
      if (userCount > 0) return;

      const existing = await this.prisma.ipWhitelistEntry.findMany({
        where: { ip: { in: DEFAULT_ADMIN_WHITELIST_IPS } },
        select: { ip: true },
      });
      const existingIps = new Set(existing.map((entry) => entry.ip));
      const missing = DEFAULT_ADMIN_WHITELIST_IPS.filter(
        (ip) => !existingIps.has(ip)
      );
      if (missing.length === 0) return;

      await this.prisma.ipWhitelistEntry.createMany({
        data: missing.map((ip) => ({
          ip,
          source: BlacklistSource.AUTO,
          reason: '首次部署默认放行（全局可访问），可在 IP 访问控制页删除',
          createdBy: 'system',
        })),
      });

      this.logger.warn(
        `已添加默认管理员白名单条目 ${missing.join(', ')}（全局可访问）。` +
          '如需收紧访问范围，请在 IP 访问控制页删除后添加受限网段'
      );
    } catch (error) {
      this.logger.error('添加默认管理员白名单条目失败', error);
      throw error;
    }
  }

  /**
   * 确保所有用户都有私人空间
   * 用于处理历史数据迁移场景
   * 优化：使用批量操作减少数据库往返
   */
  private async ensureAllUsersHavePersonalSpace(): Promise<void> {
    try {
      const startTime = Date.now();

      // 查找所有已有私人空间的用户 ID
      const personalSpaces = await this.prisma.fileSystemNode.findMany({
        where: {
          nodeType: NodeType.PERSONAL_SPACE,
        },
        select: {
          ownerId: true,
        },
      });

      const userIdsWithPersonalSpace = new Set(
        personalSpaces.map((ps) => ps.ownerId)
      );

      // 查找所有用户
      const allUsers = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          username: true,
        },
      });

      // 过滤出没有私人空间的用户
      const usersWithoutPersonalSpace = allUsers.filter(
        (user) => !userIdsWithPersonalSpace.has(user.id)
      );

      if (usersWithoutPersonalSpace.length === 0) {
        this.logger.log('所有用户都已有私人空间');
        return;
      }

      this.logger.log(
        `发现 ${usersWithoutPersonalSpace.length} 个用户没有私人空间，开始批量创建...`
      );

      // 批量创建私人空间（使用事务）。
      // 私人空间（"我的图纸"）是账号个人空间：权限按 ownerId 判断
      // （PersonalPermissionStrategy / RequireProjectPermissionGuard），
      // 不建项目成员行、不复制项目角色（ADR-00XX）。
      let createdCount = 0;
      const batchSize = 10; // 每批处理 10 个用户

      for (let i = 0; i < usersWithoutPersonalSpace.length; i += batchSize) {
        const batch = usersWithoutPersonalSpace.slice(i, i + batchSize);

        try {
          // 使用事务批量创建
          await this.prisma.$transaction(
            batch.map((user) =>
              this.prisma.fileSystemNode.create({
                data: {
                  name: PERSONAL_SPACE_NAME,
                  nodeType: NodeType.PERSONAL_SPACE,
                  projectStatus: 'ACTIVE',
                  ownerId: user.id,
                },
              })
            )
          );
          createdCount += batch.length;
        } catch (error) {
          this.logger.warn(
            `批量创建私人空间失败 (批次 ${Math.floor(i / batchSize) + 1}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ 私人空间批量创建完成: ${createdCount}/${usersWithoutPersonalSpace.length}，耗时 ${duration}ms`
      );
    } catch (error) {
      this.logger.error('批量创建私人空间失败', error);
      throw error;
    }
  }

  /**
   * 确保公共资源库存在
   * 创建公共图纸库和公共图块库
   * 优化：并行检查和创建
   */
  private async ensurePublicLibraries(): Promise<void> {
    try {
      const startTime = Date.now();

      // 获取系统管理员用户作为资源库所有者
      const adminRole = await this.prisma.role.findFirst({
        where: { name: SystemRole.ADMIN },
      });

      if (!adminRole) {
        this.logger.warn('ADMIN 角色不存在，跳过公共资源库创建');
        return;
      }

      // 查找第一个管理员用户
      const adminUser = await this.prisma.user.findFirst({
        where: { roleId: adminRole.id, deletedAt: null },
      });

      if (!adminUser) {
        this.logger.warn('未找到管理员用户，跳过公共资源库创建');
        return;
      }

      // 定义公共资源库配置
      const libraries = [
        {
          key: 'drawing',
          name: '公共图纸库',
          description: '公共 CAD 图纸资源',
        },
        {
          key: 'block',
          name: '公共图块库',
          description: '公共 CAD 图块资源',
        },
      ];

      // 并行检查和创建公共资源库
      const results = await Promise.allSettled(
        libraries.map(async (lib) => {
          // 检查是否已存在
          const existing = await this.prisma.fileSystemNode.findFirst({
            where: {
              nodeType:
                lib.key === 'drawing'
                  ? NodeType.LIBRARY_DRAWING
                  : NodeType.LIBRARY_BLOCK,
            },
          });

          if (existing) {
            return { key: lib.key, name: lib.name, status: 'exists' };
          }

          // 创建公共资源库根节点
          await this.prisma.fileSystemNode.create({
            data: {
              name: lib.name,
              description: lib.description,
              nodeType:
                lib.key === 'drawing'
                  ? NodeType.LIBRARY_DRAWING
                  : NodeType.LIBRARY_BLOCK,
              projectStatus: 'ACTIVE',
              ownerId: adminUser.id,
            },
          });

          return { key: lib.key, name: lib.name, status: 'created' };
        })
      );

      // 处理结果
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { key, name, status } = result.value;
          if (status === 'created') {
            this.logger.log(`✅ 公共资源库 ${name} 创建成功`);
          } else {
            this.logger.log(`公共资源库 ${name} 已存在`);
          }
        } else {
          this.logger.error(`创建公共资源库失败: ${result.reason}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`✅ 公共资源库初始化完成，耗时 ${duration}ms`);
    } catch (error) {
      this.logger.error('创建公共资源库失败', error);
      throw error;
    }
  }

  /**
   * 初始化会员套餐（仅表空时创建，已有数据则完全跳过）
   *
   * 设计原则：
   * - 仅首次部署时自动创建三个默认套餐
   * - 升级覆盖时如果已有套餐数据（无论是否被用户修改/删除），一律不动
   * - 未来新增套餐通过发版说明告知用户手动执行升级脚本
   */
}
