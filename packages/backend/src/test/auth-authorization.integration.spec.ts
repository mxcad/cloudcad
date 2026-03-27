///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../common/services/permission.service';
import { DatabaseService } from '../database/database.service';
import { RedisTestingModule } from '../redis/redis-testing.module';
import { UsersService } from '../users/users.service';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';

// Restore real bcrypt for integration tests
jest.unmock('bcryptjs');

// 跳过此集成测试 - 使用过时的 API，需要更新以匹配当前数据库架构
describe.skip('Authentication & Authorization Integration Tests', () => {
  let app: INestApplication;
  let prisma: DatabaseService;
  let authService: AuthService;
  let usersService: UsersService;
  let permissionService: PermissionService;

  let adminToken: string;
  let userToken: string;
  let adminUser: any;
  let regularUser: any;
  let testProject: any;
  let testFile: any;

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

    // Clean up test data
    await cleanupTestData();

    // Create test users
    await createTestUsers();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    // Clean up file system nodes before each test
    await prisma.fileAccess.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.fileSystemNode.deleteMany();

    // Clean up temporary test users (keep admin and regular user)
    await prisma.user.deleteMany({
      where: {
        id: {
          notIn: [adminUser.id, regularUser.id],
        },
      },
    });
  });

  async function cleanupTestData() {
    try {
      await prisma.fileAccess.deleteMany();
    } catch (error) {
      // 表可能不存在或为空，忽略错误
      console.warn('[cleanupTestData] 删除 fileAccess 失败:', error);
    }

    try {
      await prisma.projectMember.deleteMany();
    } catch (error) {
      // 表可能不存在或为空，忽略错误
      console.warn('[cleanupTestData] 删除 projectMember 失败:', error);
    }

    try {
      await prisma.fileSystemNode.deleteMany();
    } catch (error) {
      // 表可能不存在或为空，忽略错误
      console.warn('[cleanupTestData] 删除 fileSystemNode 失败:', error);
    }

    try {
      await prisma.user.deleteMany({
        where: {
          OR: [
            { email: { contains: 'test-integration' } },
            { username: { contains: 'test_int' } },
          ],
        },
      });
    } catch (error) {
      // 表可能不存在或为空，忽略错误
      console.warn('[cleanupTestData] 删除测试用户失败:', error);
    }
  }

  async function createTestUsers() {
    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 12);
    adminUser = await prisma.user.create({
      data: {
        email: 'admin-test-int@example.com',
        username: 'admin_test_int',
        password: hashedAdminPassword,
        nickname: 'Admin Test User',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Create regular user
    const hashedUserPassword = await bcrypt.hash('user123', 12);
    regularUser = await prisma.user.create({
      data: {
        email: 'user-test-int@example.com',
        username: 'user_test_int',
        password: hashedUserPassword,
        nickname: 'Regular Test User',
        role: UserRole.USER,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Get tokens
    const adminLogin = await authService.login({
      account: 'admin-test-int@example.com',
      password: 'admin123',
    });
    adminToken = adminLogin.accessToken;

    const userLogin = await authService.login({
      account: 'user-test-int@example.com',
      password: 'user123',
    });
    userToken = userLogin.accessToken;
  }

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const userData = {
        email: 'newuser-test-int@example.com',
        username: 'newuser_test_int',
        password: 'newuser123',
        nickname: 'New Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData);

      if (response.status !== 201) {
        // 调试输出，测试失败时保留
      }

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('email', userData.email);
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data.message).toContain('验证码已发送');
    });

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-int@example.com',
          password: 'user123',
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('user-test-int@example.com');
    });

    it('should fail login with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-int@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should refresh token', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-int@example.com',
          password: 'user123',
        });

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: loginResponse.body.data.refreshToken,
        })
        .expect(200);

      expect(refreshResponse.body.data).toHaveProperty('accessToken');
      expect(refreshResponse.body.data).toHaveProperty('refreshToken');
      expect(refreshResponse.body.data.accessToken).toBeTruthy();
      expect(refreshResponse.body.data.refreshToken).toBeTruthy();
    });

    it('should get user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: regularUser.id,
        email: regularUser.email,
        username: regularUser.username,
        role: UserRole.USER,
        status: 'ACTIVE',
      });
    });

    it('should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });

  describe('User Management Authorization', () => {
    it('should allow admin to create users', async () => {
      const userData = {
        email: 'admin_created_int@example.com',
        username: 'admin_created_int',
        password: 'password123',
        nickname: 'Admin Created User',
        role: UserRole.USER,
      };

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(userData)
        .expect(201);
    });

    it('should deny regular user to create users', async () => {
      const userData = {
        email: 'user_created_int@example.com',
        username: 'user_created_int',
        password: 'password123',
        nickname: 'User Created User',
        role: UserRole.USER,
      };

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send(userData)
        .expect(403);
    });

    it('should allow admin to list all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.data)).toBe(true);
    });

    it('should deny regular user to list all users', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should allow admin to update any user', async () => {
      const updateData = {
        nickname: 'Updated by Admin',
      };

      await request(app.getHttpServer())
        .patch(`/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);
    });

    it('should deny regular user to update other users', async () => {
      const updateData = {
        nickname: 'Updated by User',
      };

      await request(app.getHttpServer())
        .patch(`/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);
    });

    it('should allow admin to delete users', async () => {
      const tempUser = await usersService.create({
        email: 'temp_test_int@example.com',
        username: 'temp_test_int',
        password: 'temp123',
        nickname: 'Temp User',
        role: UserRole.USER,
        status: 'ACTIVE',
        emailVerified: true,
      });

      await request(app.getHttpServer())
        .delete(`/users/${tempUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should deny regular user to delete users', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Project Permissions', () => {
    beforeEach(async () => {
      // Create test project (FileSystemNode with isRoot=true)
      testProject = await prisma.fileSystemNode.create({
        data: {
          name: 'Test Project Integration',
          description: 'Test project for integration tests',
          isRoot: true,
          isFolder: true,
          projectStatus: 'ACTIVE',
          ownerId: regularUser.id,
        },
      });

      // Add regular user as project member
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          nodeId: testProject.id,
          role: ProjectMemberRole.OWNER,
        },
      });
    });

    it('should allow project owner to access project', async () => {
      await request(app.getHttpServer())
        .get(`/file-system/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it.skip('should deny non-member to access project', async () => {
      // TODO: 实现 FileSystemPermissionService 的项目权限检查
      // Create another user directly with Prisma to set emailVerified
      const hashedPassword = await bcrypt.hash('other123', 12);
      const otherUser = await prisma.user.create({
        data: {
          email: 'other_test_int@example.com',
          username: 'other_test_int',
          password: hashedPassword,
          nickname: 'Other User',
          role: UserRole.USER,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const otherLogin = await authService.login({
        account: 'other_test_int@example.com',
        password: 'other123',
      });

      await request(app.getHttpServer())
        .get(`/file-system/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${otherLogin.accessToken}`)
        .expect(403);
    });

    it.skip('should allow project admin to manage members', async () => {
      // TODO: 实现项目成员管理 API
      // Add admin as project admin
      await prisma.projectMember.create({
        data: {
          userId: adminUser.id,
          nodeId: testProject.id,
          role: ProjectMemberRole.ADMIN,
        },
      });

      const newMember = await usersService.create({
        email: 'member_test_int@example.com',
        username: 'member_test_int',
        password: 'member123',
        nickname: 'Member User',
        role: UserRole.USER,
        status: 'ACTIVE',
        emailVerified: true,
      });

      await request(app.getHttpServer())
        .post(`/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newMember.id,
          role: ProjectMemberRole.MEMBER,
        })
        .expect(201);
    });

    it.skip('should deny project member to manage members', async () => {
      // TODO: 实现项目成员管理 API
      // Update regular user to member role
      await prisma.projectMember.update({
        where: {
          userId_nodeId: {
            userId: regularUser.id,
            nodeId: testProject.id,
          },
        },
        data: {
          role: ProjectMemberRole.MEMBER,
        },
      });

      const newMember = await usersService.create({
        email: 'member2_test_int@example.com',
        username: 'member2_test_int',
        password: 'member2123',
        nickname: 'Member2 User',
        role: UserRole.USER,
        status: 'ACTIVE',
        emailVerified: true,
      });

      await request(app.getHttpServer())
        .post(`/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          userId: newMember.id,
          role: ProjectMemberRole.VIEWER,
        })
        .expect(403);
    });
  });

  describe('File Permissions', () => {
    beforeEach(async () => {
      // Create test project (FileSystemNode with isRoot=true)
      testProject = await prisma.fileSystemNode.create({
        data: {
          name: 'Test Project for Files',
          description: 'Test project for file integration tests',
          isRoot: true,
          isFolder: true,
          projectStatus: 'ACTIVE',
          ownerId: regularUser.id,
        },
      });

      // Add user as project owner
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          nodeId: testProject.id,
          role: ProjectMemberRole.OWNER,
        },
      });

      // Create test file (FileSystemNode with isFolder=false)
      testFile = await prisma.fileSystemNode.create({
        data: {
          name: 'test-file-integration.dwg',
          isFolder: false,
          size: 1024,
          mimeType: 'application/dwg',
          parentId: testProject.id,
          ownerId: regularUser.id,
          fileStatus: 'COMPLETED',
        },
      });
    });

    it('should allow file owner to access file', async () => {
      await request(app.getHttpServer())
        .get(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow file editor to modify file', async () => {
      // Add admin as file editor
      await prisma.fileAccess.create({
        data: {
          userId: adminUser.id,
          nodeId: testFile.id,
          role: FileAccessRole.EDITOR,
        },
      });

      await request(app.getHttpServer())
        .patch(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'updated-test-file.dwg',
        })
        .expect(200);
    });

    it('should allow file viewer to read file', async () => {
      // Create another user directly with Prisma
      const hashedPassword = await bcrypt.hash('viewer123', 12);
      const viewerUser = await prisma.user.create({
        data: {
          email: 'viewer_test_int@example.com',
          username: 'viewer_test_int',
          password: hashedPassword,
          nickname: 'Viewer User',
          role: UserRole.USER,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      // Add as file viewer
      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          nodeId: testFile.id,
          role: FileAccessRole.VIEWER,
        },
      });

      const viewerLogin = await authService.login({
        account: 'viewer_test_int@example.com',
        password: 'viewer123',
      });

      await request(app.getHttpServer())
        .get(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${viewerLogin.accessToken}`)
        .expect(200);
    });

    it.skip('should deny file viewer to modify file', async () => {
      // TODO: 实现 FileSystemPermissionService 的文件权限检查
      // Create another user directly with Prisma
      const hashedPassword = await bcrypt.hash('viewer2123', 12);
      const viewerUser = await prisma.user.create({
        data: {
          email: 'viewer2_test_int@example.com',
          username: 'viewer2_test_int',
          password: hashedPassword,
          nickname: 'Viewer2 User',
          role: UserRole.USER,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      // Add as file viewer
      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          nodeId: testFile.id,
          role: FileAccessRole.VIEWER,
        },
      });

      const viewerLogin = await authService.login({
        account: 'viewer2_test_int@example.com',
        password: 'viewer2123',
      });

      await request(app.getHttpServer())
        .patch(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${viewerLogin.accessToken}`)
        .send({
          name: 'should-not-update.dwg',
        })
        .expect(403);
    });

    it.skip('should deny unauthorized user to access file', async () => {
      // TODO: 实现 FileSystemPermissionService 的文件权限检查
      const hashedPassword = await bcrypt.hash('unauthorized123', 12);
      const unauthorizedUser = await prisma.user.create({
        data: {
          email: 'unauthorized_file_int@example.com',
          username: 'unauthorized_file_int',
          password: hashedPassword,
          nickname: 'Unauthorized User',
          role: UserRole.USER,
          status: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const unauthorizedLogin = await authService.login({
        account: 'unauthorized_file_int@example.com',
        password: 'unauthorized123',
      });

      await request(app.getHttpServer())
        .get(`/file-system/nodes/${testFile.id}`)
        .set('Authorization', `Bearer ${unauthorizedLogin.accessToken}`)
        .expect(403);
    });
  });

  describe('Permission Service Integration', () => {
    it('should correctly evaluate user permissions', async () => {
      // Test admin permissions
      const hasAdminPermission = await permissionService.hasPermission(
        adminUser,
        'user:delete' as any
      );
      expect(hasAdminPermission).toBe(true);

      // Test regular user permissions
      const hasUserPermission = await permissionService.hasPermission(
        regularUser,
        'user:delete' as any
      );
      expect(hasUserPermission).toBe(false);

      // Test regular user has basic permissions
      const hasBasicPermission = await permissionService.hasPermission(
        regularUser,
        'project:create' as any
      );
      expect(hasBasicPermission).toBe(true);
    });

    it.skip('should correctly evaluate project permissions', async () => {
      // TODO: 更新为使用 FileSystemPermissionService
      // Create test project (FileSystemNode with isRoot=true)
      const project = await prisma.fileSystemNode.create({
        data: {
          name: 'Permission Test Project',
          description: 'Project for permission testing',
          isRoot: true,
          isFolder: true,
          projectStatus: 'ACTIVE',
          ownerId: regularUser.id,
        },
      });

      // Add user as project member
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          nodeId: project.id,
          role: ProjectMemberRole.MEMBER,
        },
      });

      // Test project member permissions
      const hasProjectReadPermission = await permissionService.hasPermission(
        regularUser,
        'project:read' as any,
        { projectId: project.id }
      );
      expect(hasProjectReadPermission).toBe(true);

      const hasProjectDeletePermission = await permissionService.hasPermission(
        regularUser,
        'project:delete' as any,
        { projectId: project.id }
      );
      expect(hasProjectDeletePermission).toBe(false);
    });

    it.skip('should correctly evaluate file permissions', async () => {
      // TODO: 更新为使用 FileSystemPermissionService
      // Create test file (FileSystemNode with isFolder=false)
      const file = await prisma.fileSystemNode.create({
        data: {
          name: 'permission-test-file.dwg',
          isFolder: false,
          size: 1024,
          mimeType: 'application/dwg',
          ownerId: regularUser.id,
          fileStatus: 'COMPLETED',
        },
      });

      // Test file owner permissions
      const hasFileDeletePermission = await permissionService.hasPermission(
        regularUser,
        'file:delete' as any,
        { fileId: file.id }
      );
      expect(hasFileDeletePermission).toBe(true);

      // Add another user as file viewer
      const viewerUser = await usersService.create({
        email: 'file-viewer_test_int@example.com',
        username: 'file-viewer_test_int',
        password: 'viewer123',
        nickname: 'File Viewer',
        role: UserRole.USER,
        status: 'ACTIVE',
        emailVerified: true,
      });

      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          nodeId: file.id,
          role: FileAccessRole.VIEWER,
        },
      });

      // Test file viewer permissions
      const hasFileReadPermission = await permissionService.hasPermission(
        viewerUser,
        'file:read' as any,
        { fileId: file.id }
      );
      expect(hasFileReadPermission).toBe(true);

      const hasFileWritePermission = await permissionService.hasPermission(
        viewerUser,
        'file:write' as any,
        { fileId: file.id }
      );
      expect(hasFileWritePermission).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JWT tokens', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer malformed-token')
        .expect(401);
    });

    it('should handle missing authorization header', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('should handle expired tokens', async () => {
      // This would require mocking JWT verification to return expired error
      // For now, just test the flow
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);
    });

    it('should handle database connection errors gracefully', async () => {
      // This would require mocking database service to throw connection errors
      // For now, test with invalid resource IDs
      await request(app.getHttpServer())
        .get('/users/invalid-uuid-format')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404); // 无效 UUID 返回 404 Not Found
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() =>
          request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', `Bearer ${userToken}`)
        );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('id');
      });
    });
  });
});
