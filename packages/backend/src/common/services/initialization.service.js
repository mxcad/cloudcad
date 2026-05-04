///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, InternalServerErrorException, } from '@nestjs/common';
import { SystemRole, ProjectRole, DEFAULT_PROJECT_ROLE_PERMISSIONS, } from '../enums/permissions.enum';
/**
 * 系统初始化服务
 *
 * 功能：
 * 1. 检查是否为首次启动（无任何用户）
 * 2. 首次启动时自动创建所有系统默认角色和项目默认角色
 * 3. 首次启动时自动创建管理员账户
 * 4. 后续访问禁止注册
 */
let InitializationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var InitializationService = _classThis = class {
        constructor(prisma, configService, userService) {
            this.prisma = prisma;
            this.configService = configService;
            this.userService = userService;
            this.logger = new Logger(InitializationService.name);
        }
        /**
         * 模块初始化时执行
         * 优化：使用并行查询减少启动时间
         */
        async onModuleInit() {
            const startTime = Date.now();
            this.logger.log('开始系统初始化...');
            // 并行执行独立的初始化任务
            await Promise.all([
                this.createSystemDefaultRoles(),
                this.createProjectDefaultRoles(),
            ]);
            // 串行执行有依赖的任务
            await this.checkAndCreateInitialAdmin();
            await this.ensureAllUsersHavePersonalSpace();
            await this.ensurePublicLibraries();
            const duration = Date.now() - startTime;
            this.logger.log(`✅ 系统初始化完成，耗时 ${duration}ms`);
        }
        /**
         * 创建系统默认角色
         */
        async createSystemDefaultRoles() {
            try {
                const defaultRoles = [
                    {
                        name: SystemRole.ADMIN,
                        description: '系统管理员，拥有所有权限',
                        permissions: [
                            'SYSTEM_USER_READ',
                            'SYSTEM_USER_CREATE',
                            'SYSTEM_USER_UPDATE',
                            'SYSTEM_USER_DELETE',
                            'SYSTEM_ROLE_READ',
                            'SYSTEM_ROLE_CREATE',
                            'SYSTEM_ROLE_UPDATE',
                            'SYSTEM_ROLE_DELETE',
                            'SYSTEM_ROLE_PERMISSION_MANAGE',
                            'SYSTEM_FONT_READ',
                            'SYSTEM_FONT_UPLOAD',
                            'SYSTEM_FONT_DELETE',
                            'SYSTEM_FONT_DOWNLOAD',
                            'SYSTEM_ADMIN',
                            'SYSTEM_MONITOR',
                            'SYSTEM_CONFIG_READ',
                            'SYSTEM_CONFIG_WRITE',
                            'LIBRARY_DRAWING_MANAGE',
                            'LIBRARY_BLOCK_MANAGE',
                            'STORAGE_QUOTA',
                            'PROJECT_CREATE',
                        ],
                    },
                    {
                        name: SystemRole.USER_MANAGER,
                        description: '用户管理员，管理系统用户和角色',
                        permissions: [
                            'SYSTEM_USER_READ',
                            'SYSTEM_USER_CREATE',
                            'SYSTEM_USER_UPDATE',
                            'SYSTEM_USER_DELETE',
                            'SYSTEM_ROLE_READ',
                            'SYSTEM_ROLE_CREATE',
                            'SYSTEM_ROLE_UPDATE',
                            'SYSTEM_ROLE_DELETE',
                            'SYSTEM_ROLE_PERMISSION_MANAGE',
                            'STORAGE_QUOTA',
                            'PROJECT_CREATE',
                        ],
                    },
                    {
                        name: SystemRole.FONT_MANAGER,
                        description: '字体管理员，管理系统字体库',
                        permissions: [
                            'SYSTEM_FONT_READ',
                            'SYSTEM_FONT_UPLOAD',
                            'SYSTEM_FONT_DELETE',
                            'SYSTEM_FONT_DOWNLOAD',
                            'PROJECT_CREATE',
                        ],
                    },
                    {
                        name: SystemRole.USER,
                        description: '普通用户，基本访问权限',
                        permissions: ['PROJECT_CREATE'], // 普通用户可以创建项目
                    },
                ];
                for (const roleConfig of defaultRoles) {
                    const existingRole = await this.prisma.role.findFirst({
                        where: { name: roleConfig.name },
                        include: { permissions: true },
                    });
                    if (existingRole) {
                        // 权限审计：检测并警告权限不一致，但不强制同步
                        const existingPerms = new Set(existingRole.permissions.map((p) => p.permission));
                        const expectedPerms = new Set(roleConfig.permissions.map((p) => p));
                        // 1. 检测缺失的权限（仅警告，不自动补充）
                        const missingPerms = roleConfig.permissions.filter((p) => !existingPerms.has(p));
                        if (missingPerms.length > 0) {
                            this.logger.warn(`⚠️  权限审计警告：系统角色 ${roleConfig.name} 缺少 ${missingPerms.length} 个默认权限: ${missingPerms.join(', ')}`);
                            this.logger.warn(`   这可能是手动配置的权限。如果需要补充，请在角色管理页面手动添加。`);
                        }
                        // 2. 检查并恢复关键权限（系统角色的核心权限不能被取消）
                        const criticalPerms = this.getCriticalPermissions(roleConfig.name);
                        const missingCriticalPerms = criticalPerms.filter((p) => !existingPerms.has(p));
                        if (missingCriticalPerms.length > 0) {
                            this.logger.warn(`⚠️  关键权限缺失：系统角色 ${roleConfig.name} 缺少关键权限: ${missingCriticalPerms.join(', ')}`);
                            this.logger.warn(`   正在自动恢复关键权限...`);
                            await this.prisma.rolePermission.createMany({
                                data: missingCriticalPerms.map((permission) => ({
                                    roleId: existingRole.id,
                                    permission: permission,
                                })),
                                skipDuplicates: true,
                            });
                            this.logger.log(`✅ 系统角色 ${roleConfig.name} 已恢复 ${missingCriticalPerms.length} 个关键权限`);
                        }
                        // 3. 检测多余的权限（仅警告，不删除）
                        const extraPerms = Array.from(existingPerms).filter((p) => !expectedPerms.has(p));
                        if (extraPerms.length > 0) {
                            this.logger.error(`⚠️  权限审计警告：系统角色 ${roleConfig.name} 有 ${extraPerms.length} 个非预期权限: ${extraPerms.join(', ')}`);
                            this.logger.error(`   这可能是手动配置的权限。如果这是错误的配置，请手动删除。`);
                        }
                        // 4. 权限完全一致时输出日志
                        if (missingPerms.length === 0 && extraPerms.length === 0) {
                            this.logger.debug(`系统角色 ${roleConfig.name} 权限正常（${existingPerms.size} 个权限）`);
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
                            level: roleConfig.name === SystemRole.ADMIN ? 100 : 0,
                        },
                    });
                    await this.prisma.rolePermission.createMany({
                        data: roleConfig.permissions.map((permission) => ({
                            roleId: role.id,
                            permission: permission,
                        })),
                        skipDuplicates: true,
                    });
                    this.logger.log(`✅ 系统角色 ${roleConfig.name} 创建成功，分配 ${roleConfig.permissions.length} 个权限`);
                }
            }
            catch (error) {
                this.logger.error('创建系统默认角色失败', error);
                throw error;
            }
        }
        /**
         * 获取系统角色的关键权限（不能被取消的权限）
         */
        getCriticalPermissions(roleName) {
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
        async createProjectDefaultRoles() {
            try {
                // 角色描述映射
                const roleDescriptions = {
                    [ProjectRole.OWNER]: '项目所有者，拥有项目的完整管理权限',
                    [ProjectRole.ADMIN]: '项目管理员，管理项目和团队成员',
                    [ProjectRole.MEMBER]: '项目成员，可以查看和编辑项目内容',
                    [ProjectRole.EDITOR]: '项目编辑者，可以编辑项目文件',
                    [ProjectRole.VIEWER]: '项目查看者，仅能查看项目内容',
                };
                // 遍历所有项目角色，使用 DEFAULT_PROJECT_ROLE_PERMISSIONS 作为唯一来源
                for (const [roleKey, permissions] of Object.entries(DEFAULT_PROJECT_ROLE_PERMISSIONS)) {
                    const roleName = roleKey;
                    const description = roleDescriptions[roleName];
                    const permissionStrings = permissions.map((p) => p);
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
                        const existingPerms = new Set(existingRole.permissions.map((p) => p.permission));
                        const expectedPerms = new Set(permissionStrings.map((p) => p));
                        // 1. 检测缺失的权限（仅警告，不自动补充）
                        const missingPerms = permissionStrings.filter((p) => !existingPerms.has(p));
                        if (missingPerms.length > 0) {
                            this.logger.warn(`⚠️  权限审计警告：项目角色 ${roleName} 缺少 ${missingPerms.length} 个默认权限: ${missingPerms.join(', ')}`);
                            this.logger.warn(`   这可能是手动配置的权限。如果需要补充，请在角色管理页面手动添加。`);
                        }
                        // 2. 检测多余的权限（仅警告，不删除）
                        const extraPerms = Array.from(existingPerms).filter((p) => !expectedPerms.has(p));
                        if (extraPerms.length > 0) {
                            this.logger.error(`⚠️  权限审计警告：项目角色 ${roleName} 有 ${extraPerms.length} 个非预期权限: ${extraPerms.join(', ')}`);
                            this.logger.error(`   这可能是手动配置的权限。如果这是错误的配置，请手动删除。`);
                        }
                        // 3. 权限完全一致时输出日志
                        if (missingPerms.length === 0 && extraPerms.length === 0) {
                            this.logger.debug(`项目角色 ${roleName} 权限正常（${existingPerms.size} 个权限）`);
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
                            permission: permission,
                        })),
                        skipDuplicates: true,
                    });
                    this.logger.log(`✅ 项目角色 ${roleName} 创建成功，分配 ${permissions.length} 个权限`);
                }
            }
            catch (error) {
                this.logger.error('创建项目默认角色失败', error);
                throw error;
            }
        }
        /**
         * 检查并创建初始管理员账户
         */
        async checkAndCreateInitialAdmin() {
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
                    throw new InternalServerErrorException('ADMIN 角色不存在，请检查系统默认角色创建逻辑');
                }
                // 创建初始管理员账户
                const adminEmail = this.configService.get('INITIAL_ADMIN_EMAIL', 'admin@example.com');
                const adminUsername = this.configService.get('INITIAL_ADMIN_USERNAME', 'admin');
                const adminPassword = this.configService.get('INITIAL_ADMIN_PASSWORD', 'Admin123!');
                // 使用 IUserService 创建用户（会自动创建私人空间）
                if (!this.userService) {
                    throw new Error('UserService 不可用，无法创建管理员账户');
                }
                await this.userService.create({
                    email: adminEmail,
                    username: adminUsername,
                    password: adminPassword,
                    nickname: '系统管理员',
                    roleId: adminRole.id,
                });
                this.logger.log(`✅ 初始管理员账户创建成功！\n` +
                    `   邮箱: ${adminEmail}\n` +
                    `   用户名: ${adminUsername}\n` +
                    `   密码: ${adminPassword}\n` +
                    `   ⚠️  请在首次登录后立即修改密码！`);
            }
            catch (error) {
                this.logger.error('创建初始管理员账户失败', error);
                throw error;
            }
        }
        /**
         * 确保所有用户都有私人空间
         * 用于处理历史数据迁移场景
         * 优化：使用批量操作减少数据库往返
         */
        async ensureAllUsersHavePersonalSpace() {
            try {
                const startTime = Date.now();
                // 查找所有已有私人空间的用户 ID
                const personalSpaces = await this.prisma.fileSystemNode.findMany({
                    where: {
                        personalSpaceKey: { not: null },
                    },
                    select: {
                        personalSpaceKey: true,
                    },
                });
                const userIdsWithPersonalSpace = new Set(personalSpaces.map((ps) => ps.personalSpaceKey));
                // 查找所有用户
                const allUsers = await this.prisma.user.findMany({
                    select: {
                        id: true,
                        username: true,
                    },
                });
                // 过滤出没有私人空间的用户
                const usersWithoutPersonalSpace = allUsers.filter((user) => !userIdsWithPersonalSpace.has(user.id));
                if (usersWithoutPersonalSpace.length === 0) {
                    this.logger.log('所有用户都已有私人空间');
                    return;
                }
                this.logger.log(`发现 ${usersWithoutPersonalSpace.length} 个用户没有私人空间，开始批量创建...`);
                // 获取 PROJECT_OWNER 角色
                const ownerRole = await this.prisma.projectRole.findFirst({
                    where: { name: 'PROJECT_OWNER', isSystem: true },
                });
                if (!ownerRole) {
                    throw new InternalServerErrorException('PROJECT_OWNER 角色不存在');
                }
                // 批量创建私人空间（使用事务）
                let createdCount = 0;
                const batchSize = 10; // 每批处理 10 个用户
                for (let i = 0; i < usersWithoutPersonalSpace.length; i += batchSize) {
                    const batch = usersWithoutPersonalSpace.slice(i, i + batchSize);
                    try {
                        // 使用事务批量创建
                        await this.prisma.$transaction(batch.map((user) => this.prisma.fileSystemNode.create({
                            data: {
                                name: '我的图纸',
                                isFolder: true,
                                isRoot: true,
                                personalSpaceKey: user.id,
                                projectStatus: 'ACTIVE',
                                ownerId: user.id,
                                projectMembers: {
                                    create: {
                                        userId: user.id,
                                        projectRoleId: ownerRole.id,
                                    },
                                },
                            },
                        })));
                        createdCount += batch.length;
                    }
                    catch (error) {
                        this.logger.warn(`批量创建私人空间失败 (批次 ${Math.floor(i / batchSize) + 1}): ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                const duration = Date.now() - startTime;
                this.logger.log(`✅ 私人空间批量创建完成: ${createdCount}/${usersWithoutPersonalSpace.length}，耗时 ${duration}ms`);
            }
            catch (error) {
                this.logger.error('批量创建私人空间失败', error);
                throw error;
            }
        }
        /**
         * 确保公共资源库存在
         * 创建公共图纸库和公共图块库
         * 优化：并行检查和创建
         */
        async ensurePublicLibraries() {
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
                    where: { roleId: adminRole.id },
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
                const results = await Promise.allSettled(libraries.map(async (lib) => {
                    // 检查是否已存在
                    const existing = await this.prisma.fileSystemNode.findFirst({
                        where: { libraryKey: lib.key, isRoot: true },
                    });
                    if (existing) {
                        return { key: lib.key, name: lib.name, status: 'exists' };
                    }
                    // 创建公共资源库根节点
                    await this.prisma.fileSystemNode.create({
                        data: {
                            name: lib.name,
                            description: lib.description,
                            isFolder: true,
                            isRoot: true,
                            libraryKey: lib.key,
                            projectStatus: 'ACTIVE',
                            ownerId: adminUser.id,
                        },
                    });
                    return { key: lib.key, name: lib.name, status: 'created' };
                }));
                // 处理结果
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        const { key, name, status } = result.value;
                        if (status === 'created') {
                            this.logger.log(`✅ 公共资源库 ${name} 创建成功`);
                        }
                        else {
                            this.logger.log(`公共资源库 ${name} 已存在`);
                        }
                    }
                    else {
                        this.logger.error(`创建公共资源库失败: ${result.reason}`);
                    }
                }
                const duration = Date.now() - startTime;
                this.logger.log(`✅ 公共资源库初始化完成，耗时 ${duration}ms`);
            }
            catch (error) {
                this.logger.error('创建公共资源库失败', error);
                throw error;
            }
        }
        /**
         * 检查是否允许注册
         *
         * @returns 如果允许注册返回 true，否则返回 false
         */
        async isRegistrationAllowed() {
            const userCount = await this.prisma.user.count();
            return userCount === 0;
        }
        /**
         * 检查是否为首次启动
         *
         * @returns 如果为首次启动返回 true，否则返回 false
         */
        async isFirstStartup() {
            const userCount = await this.prisma.user.count();
            return userCount === 0;
        }
    };
    __setFunctionName(_classThis, "InitializationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        InitializationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return InitializationService = _classThis;
})();
export { InitializationService };
//# sourceMappingURL=initialization.service.js.map