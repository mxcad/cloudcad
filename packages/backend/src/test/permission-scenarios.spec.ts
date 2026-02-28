import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import {
  FileAccessRole,
  ProjectMemberRole,
  UserRole,
} from '../common/enums/permissions.enum';
import { PermissionService } from '../common/services/permission.service';
import { RoleInheritanceService } from '../common/services/role-inheritance.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { SystemPermission } from '../common/enums/permissions.enum';

/**
 * 核心权限场景测试
 *
 * 覆盖以下核心权限场景：
 * 1. 系统管理员权限
 * 2. 用户管理权限
 * 3. 角色管理权限
 * 4. 项目管理权限
 * 5. 文件访问权限
 * 6. 角色继承权限
 * 7. 权限缓存一致性
 */
describe('核心权限场景测试', () => {
  let app: INestApplication;
  let prisma: DatabaseService;
  let authService: AuthService;
  let usersService: UsersService;
  let permissionService: PermissionService;
  let roleInheritanceService: RoleInheritanceService;

  let adminToken: string;
  let userManagerToken: string;
  let fontManagerToken: string;
  let userToken: string;

  let adminUser: any;
  let userManager: any;
  let fontManager: any;
  let regularUser: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRedisConnectionToken())
      .useValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        exists: jest.fn().mockResolvedValue(0),
        expire: jest.fn().mockResolvedValue(1),
        keys: jest.fn().mockResolvedValue([]),
        flushdb: jest.fn().mockResolvedValue('OK'),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
        quit: jest.fn().mockResolvedValue('OK'),
      })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = moduleFixture.get<DatabaseService>(DatabaseService);
    authService = moduleFixture.get<AuthService>(AuthService);
    usersService = moduleFixture.get<UsersService>(UsersService);
    permissionService = moduleFixture.get<PermissionService>(PermissionService);
    roleInheritanceService = moduleFixture.get<RoleInheritanceService>(
      RoleInheritanceService
    );

    // 清理测试数据
    await cleanupTestData();

    // 创建测试用户
    await createTestUsers();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    // 完全重置测试环境，确保测试隔离性
    await prisma.$transaction(async (tx) => {
      // 清理所有测试相关的数据
      await tx.fileAccess.deleteMany();
      await tx.projectMember.deleteMany();
      await tx.fileSystemNode.deleteMany();
    });
  });

  async function cleanupTestData() {
    // 使用事务确保数据一致性，避免部分删除导致的数据不一致
    await prisma.$transaction(async (tx) => {
      // 先删除关联数据（外键依赖顺序）
      await tx.fileAccess.deleteMany();

      await tx.projectMember.deleteMany();

      await tx.fileSystemNode.deleteMany();

      // 最后删除用户
      await tx.user.deleteMany({
        where: {
          OR: [
            { email: { contains: 'permission-scenario' } },
            { username: { contains: 'perm_scen' } },
          ],
        },
      });
    });
  }

  async function createTestUsers() {
    // 辅助函数：创建测试用户
    async function createTestUser(
      email: string,
      username: string,
      password: string,
      nickname: string,
      role: UserRole
    ) {
      const hashedPassword = await bcrypt.hash(password, 12);
      return await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          nickname,
          role,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    // 创建管理员
    adminUser = await createTestUser(
      'admin-perm-scen@example.com',
      'admin_perm_scen',
      'admin123',
      'Admin Scenario User',
      UserRole.ADMIN
    );

    // 创建用户管理员
    userManager = await createTestUser(
      'usermanager-perm-scen@example.com',
      'usermanager_perm_scen',
      'usermgr123',
      'User Manager Scenario User',
      UserRole.USER_MANAGER
    );

    // 创建字体管理员
    fontManager = await createTestUser(
      'fontmanager-perm-scen@example.com',
      'fontmanager_perm_scen',
      'fontmgr123',
      'Font Manager Scenario User',
      UserRole.FONT_MANAGER
    );

    // 创建普通用户
    regularUser = await createTestUser(
      'user-perm-scen@example.com',
      'user_perm_scen',
      'user123',
      'Regular Scenario User',
      UserRole.USER
    );

    // 获取令牌
    const adminLogin = await authService.login({
      account: 'admin-perm-scen@example.com',
      password: 'admin123',
    });
    adminToken = adminLogin.accessToken;

    const userManagerLogin = await authService.login({
      account: 'usermanager-perm-scen@example.com',
      password: 'usermgr123',
    });
    userManagerToken = userManagerLogin.accessToken;

    const fontManagerLogin = await authService.login({
      account: 'fontmanager-perm-scen@example.com',
      password: 'fontmgr123',
    });
    fontManagerToken = fontManagerLogin.accessToken;

    const userLogin = await authService.login({
      account: 'user-perm-scen@example.com',
      password: 'user123',
    });
    userToken = userLogin.accessToken;
  }

  describe('场景 1: 系统管理员权限', () => {
    it('应该允许管理员执行所有系统操作', async () => {
      const operations = [
        { endpoint: '/users', method: 'get', body: {} },
        {
          endpoint: '/users',
          method: 'post',
          body: {
            email: 'test@example.com',
            username: 'test',
            password: 'test123',
            nickname: 'Test',
          },
        },
      ];

      for (const op of operations) {
        const response = await request(app.getHttpServer())
          [op.method](op.endpoint)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(op.body);

        // 允许 400（验证错误）和 2xx 响应
        expect([200, 201, 400, 409].includes(response.status)).toBe(true);
      }
    });

    it('应该允许管理员监控系统状态', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401].includes(response.status)).toBe(true);
    });
  });

  describe('场景 2: 用户管理权限', () => {
    it('应该允许用户管理员读取用户列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userManagerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('data');
    });

    it('应该允许用户管理员创建用户', async () => {
      const userData = {
        email: 'newuser-scen@example.com',
        username: 'newuser_scen',
        password: 'newuser123',
        nickname: 'New Scenario User',
        role: UserRole.USER,
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userManagerToken}`)
        .send(userData);

      expect(response.status).toBe(201);
    });

    it('应该拒绝普通用户创建用户', async () => {
      const userData = {
        email: 'user-created-scen@example.com',
        username: 'user_created_scen',
        password: 'password123',
        nickname: 'User Created Scenario User',
        role: UserRole.USER,
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send(userData);

      expect(response.status).toBe(403);
    });
  });

  describe('场景 3: 角色管理权限', () => {
    it('应该允许管理员读取角色列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404].includes(response.status)).toBe(true);
    });

    it('应该拒绝普通用户管理角色', async () => {
      const response = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('场景 4: 项目管理权限', () => {
    let testProject: any;

    beforeEach(async () => {
      // 创建测试项目
      testProject = await prisma.fileSystemNode.create({
        data: {
          name: 'Permission Test Project',
          description: 'Project for permission scenario tests',
          isRoot: true,
          isFolder: true,
          projectStatus: 'ACTIVE',
          ownerId: regularUser.id,
        },
      });

      // 添加用户为项目所有者
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          nodeId: testProject.id,
          role: ProjectMemberRole.OWNER,
        },
      });
    });

    it('应该允许项目所有者访问项目', async () => {
      const response = await request(app.getHttpServer())
        .get(`/file-system/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404].includes(response.status)).toBe(true);
    });

    it('应该允许普通用户创建项目', async () => {
      const projectData = {
        name: 'New Scenario Project',
        description: 'Created by regular user',
      };

      const response = await request(app.getHttpServer())
        .post('/file-system/projects')
        .set('Authorization', `Bearer ${userToken}`)
        .send(projectData);

      expect([201, 400].includes(response.status)).toBe(true);
    });
  });

  describe('场景 5: 文件访问权限', () => {
    let testFile: any;

    beforeEach(async () => {
      // 创建测试文件
      testFile = await prisma.fileSystemNode.create({
        data: {
          name: 'permission-test-file.dwg',
          isFolder: false,
          size: 1024,
          mimeType: 'application/dwg',
          ownerId: regularUser.id,
          fileStatus: 'COMPLETED',
        },
      });
    });

    it('应该允许文件所有者访问文件', async () => {
      const response = await request(app.getHttpServer())
        .get(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404].includes(response.status)).toBe(true);
    });

    it('应该允许文件编辑者修改文件', async () => {
      // 添加用户管理员为文件编辑者
      await prisma.fileAccess.create({
        data: {
          userId: userManager.id,
          nodeId: testFile.id,
          role: FileAccessRole.EDITOR,
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${userManagerToken}`)
        .send({
          name: 'updated-test-file.dwg',
        });

      expect([200, 404].includes(response.status)).toBe(true);
    });
  });

  describe('场景 6: 角色继承权限', () => {
    it('应该验证 USER_MANAGER 继承 USER 权限', async () => {
      // 检查用户管理员是否具有普通用户的权限
      const hasProjectCreatePermission =
        await permissionService.checkSystemPermission(
          userManager.id,
          SystemPermission.PROJECT_CREATE
        );

      expect(hasProjectCreatePermission).toBe(true);
    });

    it('应该验证 FONT_MANAGER 继承 USER 权限', async () => {
      // 检查字体管理员是否具有普通用户的权限
      const hasProjectCreatePermission =
        await permissionService.checkSystemPermission(
          fontManager.id,
          SystemPermission.PROJECT_CREATE
        );

      expect(hasProjectCreatePermission).toBe(true);
    });

    it('应该验证角色继承链路', async () => {
      // 获取用户管理器的所有权限（包括继承的）
      const userPermissions = await roleInheritanceService.getRolePermissions(
        UserRole.USER_MANAGER
      );

      // 应该包含 USER 的权限
      expect(userPermissions.length).toBeGreaterThan(0);
    });
  });

  describe('场景 7: 权限缓存一致性', () => {
    it('应该验证权限缓存一致性', async () => {
      // 第一次检查
      const firstCheck = await permissionService.checkSystemPermission(
        regularUser.id,
        SystemPermission.PROJECT_CREATE
      );

      // 第二次检查（应该使用缓存）
      const secondCheck = await permissionService.checkSystemPermission(
        regularUser.id,
        SystemPermission.PROJECT_CREATE
      );

      // 两次结果应该一致
      expect(firstCheck).toBe(secondCheck);
    });

    it('应该在清除缓存后重新检查权限', async () => {
      // 第一次检查
      const firstCheck = await permissionService.checkSystemPermission(
        regularUser.id,
        SystemPermission.PROJECT_CREATE
      );

      // 清除缓存
      await permissionService.clearUserCache(regularUser.id);

      // 第二次检查（应该重新查询数据库）
      const secondCheck = await permissionService.checkSystemPermission(
        regularUser.id,
        SystemPermission.PROJECT_CREATE
      );

      // 两次结果应该一致
      expect(firstCheck).toBe(secondCheck);
    });
  });

  describe('场景 8: 批量权限检查', () => {
    it('应该支持批量权限检查', async () => {
      const permissions = [
        SystemPermission.PROJECT_CREATE,
        SystemPermission.FONT_UPLOAD,
        SystemPermission.USER_READ,
      ];

      const results = await permissionService.checkSystemPermissionsBatch(
        adminUser.id,
        permissions
      );

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(permissions.length);

      // 管理员应该具有所有权限
      for (const [permission, hasPermission] of results.entries()) {
        expect(hasPermission).toBe(true);
      }
    });

    it('应该正确返回部分权限', async () => {
      const permissions = [
        SystemPermission.PROJECT_CREATE,
        SystemPermission.USER_DELETE, // 普通用户不应该有此权限
      ];

      const results = await permissionService.checkSystemPermissionsBatch(
        regularUser.id,
        permissions
      );

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(permissions.length);

      expect(results.get(SystemPermission.PROJECT_CREATE)).toBe(true);
      expect(results.get(SystemPermission.USER_DELETE)).toBe(false);
    });
  });

  describe('场景 9: 跨角色权限验证', () => {
    it('应该验证不同角色的权限隔离', async () => {
      // 普通用户不应该有用户管理权限
      const userHasUserDelete = await permissionService.checkSystemPermission(
        regularUser.id,
        SystemPermission.USER_DELETE
      );
      expect(userHasUserDelete).toBe(false);

      // 用户管理员应该有用户管理权限
      const userManagerHasUserDelete =
        await permissionService.checkSystemPermission(
          userManager.id,
          SystemPermission.USER_DELETE
        );
      expect(userManagerHasUserDelete).toBe(true);

      // 管理员应该有所有权限
      const adminHasUserDelete = await permissionService.checkSystemPermission(
        adminUser.id,
        SystemPermission.USER_DELETE
      );
      expect(adminHasUserDelete).toBe(true);
    });
  });

  describe('场景 10: 权限边界测试', () => {
    it('应该处理无效的用户 ID', async () => {
      const result = await permissionService.checkSystemPermission(
        'invalid-user-id',
        SystemPermission.PROJECT_CREATE
      );

      expect(result).toBe(false);
    });

    it('应该处理不存在的权限', async () => {
      const result = await permissionService.checkSystemPermission(
        regularUser.id,
        'nonexistent:permission' as SystemPermission
      );

      expect(result).toBe(false);
    });

    it('应该处理用户角色为 null 的情况', async () => {
      // 创建一个没有角色的用户
      const tempUser = await prisma.user.create({
        data: {
          email: 'norole-scen@example.com',
          username: 'norole_scen',
          password: await bcrypt.hash('test123', 12),
          nickname: 'No Role User',
          roleId: '', // 空角色 ID
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const result = await permissionService.checkSystemPermission(
        tempUser.id,
        SystemPermission.PROJECT_CREATE
      );

      expect(result).toBe(false);

      // 清理
      await prisma.user.delete({ where: { id: tempUser.id } });
    });
  });
});
