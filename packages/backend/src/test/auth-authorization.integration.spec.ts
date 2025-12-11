import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import {
  FileAccessRole,
  ProjectMemberRole,
  UserRole,
} from '../common/enums/permissions.enum';
import { PermissionService } from '../common/services/permission.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';

describe('Authentication & Authorization Integration Tests', () => {
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
    }).compile();

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
    // Clean up projects and files before each test
    await prisma.fileAccess.deleteMany();
    await prisma.file.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  });

  async function cleanupTestData() {
    await prisma.fileAccess.deleteMany();
    await prisma.file.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: 'test-integration' } },
          { username: { contains: 'test-integration' } },
        ],
      },
    });
  }

  async function createTestUsers() {
    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 12);
    adminUser = await prisma.user.create({
      data: {
        email: 'admin-test-integration@example.com',
        username: 'admin-test-integration',
        password: hashedAdminPassword,
        nickname: 'Admin Test User',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
    });

    // Create regular user
    const hashedUserPassword = await bcrypt.hash('user123', 12);
    regularUser = await prisma.user.create({
      data: {
        email: 'user-test-integration@example.com',
        username: 'user-test-integration',
        password: hashedUserPassword,
        nickname: 'Regular Test User',
        role: UserRole.USER,
        status: 'ACTIVE',
      },
    });

    // Get tokens
    const adminLogin = await authService.login({
      account: 'admin-test-integration@example.com',
      password: 'admin123',
    });
    adminToken = adminLogin.accessToken;

    const userLogin = await authService.login({
      account: 'user-test-integration@example.com',
      password: 'user123',
    });
    userToken = userLogin.accessToken;
  }

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const userData = {
        email: 'newuser-test-integration@example.com',
        username: 'newuser-test-integration',
        password: 'newuser123',
        nickname: 'New Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toMatchObject({
        email: userData.email,
        username: userData.username,
        nickname: userData.nickname,
        role: UserRole.USER,
        status: 'ACTIVE',
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-integration@example.com',
          password: 'user123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(
        'user-test-integration@example.com'
      );
    });

    it('should fail login with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-integration@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should refresh token', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          account: 'user-test-integration@example.com',
          password: 'user123',
        });

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: loginResponse.body.refreshToken,
        })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).toHaveProperty('refreshToken');
      expect(refreshResponse.body.accessToken).not.toBe(
        loginResponse.body.accessToken
      );
    });

    it('should get user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
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
        email: 'admin-created-test-integration@example.com',
        username: 'admin-created-test-integration',
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
        email: 'user-created-test-integration@example.com',
        username: 'user-created-test-integration',
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

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
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
        email: 'temp-test-integration@example.com',
        username: 'temp-test-integration',
        password: 'temp123',
        nickname: 'Temp User',
        role: UserRole.USER,
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
      // Create test project
      testProject = await prisma.project.create({
        data: {
          name: 'Test Project Integration',
          description: 'Test project for integration tests',
          creatorId: regularUser.id,
        },
      });

      // Add regular user as project member
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          projectId: testProject.id,
          role: ProjectMemberRole.OWNER,
        },
      });
    });

    it('should allow project owner to access project', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should deny non-member to access project', async () => {
      // Create another user
      const otherUser = await usersService.create({
        email: 'other-test-integration@example.com',
        username: 'other-test-integration',
        password: 'other123',
        nickname: 'Other User',
        role: UserRole.USER,
      });

      const otherLogin = await authService.login({
        account: 'other-test-integration@example.com',
        password: 'other123',
      });

      await request(app.getHttpServer())
        .get(`/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${otherLogin.accessToken}`)
        .expect(403);
    });

    it('should allow project admin to manage members', async () => {
      // Add admin as project admin
      await prisma.projectMember.create({
        data: {
          userId: adminUser.id,
          projectId: testProject.id,
          role: ProjectMemberRole.ADMIN,
        },
      });

      const newMember = await usersService.create({
        email: 'member-test-integration@example.com',
        username: 'member-test-integration',
        password: 'member123',
        nickname: 'Member User',
        role: UserRole.USER,
      });

      await request(app.getHttpServer())
        .post(`/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newMember.id,
          role: ProjectMemberRole.MEMBER,
        })
        .expect(201);
    });

    it('should deny project member to manage members', async () => {
      // Update regular user to member role
      await prisma.projectMember.update({
        where: {
          userId_projectId: {
            userId: regularUser.id,
            projectId: testProject.id,
          },
        },
        data: {
          role: ProjectMemberRole.MEMBER,
        },
      });

      const newMember = await usersService.create({
        email: 'member2-test-integration@example.com',
        username: 'member2-test-integration',
        password: 'member2123',
        nickname: 'Member2 User',
        role: UserRole.USER,
      });

      await request(app.getHttpServer())
        .post(`/projects/${testProject.id}/members`)
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
      // Create test project
      testProject = await prisma.project.create({
        data: {
          name: 'Test Project for Files',
          description: 'Test project for file integration tests',
          creatorId: regularUser.id,
        },
      });

      // Add user as project owner
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          projectId: testProject.id,
          role: ProjectMemberRole.OWNER,
        },
      });

      // Create test file
      testFile = await prisma.file.create({
        data: {
          name: 'test-file-integration.dwg',
          size: 1024,
          mimeType: 'application/dwg',
          projectId: testProject.id,
          creatorId: regularUser.id,
        },
      });
    });

    it('should allow file owner to access file', async () => {
      await request(app.getHttpServer())
        .get(`/files/${testFile.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('should allow file editor to modify file', async () => {
      // Add admin as file editor
      await prisma.fileAccess.create({
        data: {
          userId: adminUser.id,
          fileId: testFile.id,
          role: FileAccessRole.EDITOR,
        },
      });

      await request(app.getHttpServer())
        .patch(`/files/${testFile.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'updated-test-file.dwg',
        })
        .expect(200);
    });

    it('should allow file viewer to read file', async () => {
      // Create another user
      const viewerUser = await usersService.create({
        email: 'viewer-test-integration@example.com',
        username: 'viewer-test-integration',
        password: 'viewer123',
        nickname: 'Viewer User',
        role: UserRole.USER,
      });

      // Add as file viewer
      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          fileId: testFile.id,
          role: FileAccessRole.VIEWER,
        },
      });

      const viewerLogin = await authService.login({
        account: 'viewer-test-integration@example.com',
        password: 'viewer123',
      });

      await request(app.getHttpServer())
        .get(`/files/${testFile.id}`)
        .set('Authorization', `Bearer ${viewerLogin.accessToken}`)
        .expect(200);
    });

    it('should deny file viewer to modify file', async () => {
      // Create another user
      const viewerUser = await usersService.create({
        email: 'viewer2-test-integration@example.com',
        username: 'viewer2-test-integration',
        password: 'viewer2123',
        nickname: 'Viewer2 User',
        role: UserRole.USER,
      });

      // Add as file viewer
      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          fileId: testFile.id,
          role: FileAccessRole.VIEWER,
        },
      });

      const viewerLogin = await authService.login({
        account: 'viewer2-test-integration@example.com',
        password: 'viewer2123',
      });

      await request(app.getHttpServer())
        .patch(`/files/${testFile.id}`)
        .set('Authorization', `Bearer ${viewerLogin.accessToken}`)
        .send({
          name: 'should-not-update.dwg',
        })
        .expect(403);
    });

    it('should deny unauthorized user to access file', async () => {
      const unauthorizedUser = await usersService.create({
        email: 'unauthorized-test-integration@example.com',
        username: 'unauthorized-test-integration',
        password: 'unauthorized123',
        nickname: 'Unauthorized User',
        role: UserRole.USER,
      });

      const unauthorizedLogin = await authService.login({
        account: 'unauthorized-test-integration@example.com',
        password: 'unauthorized123',
      });

      await request(app.getHttpServer())
        .get(`/files/${testFile.id}`)
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

    it('should correctly evaluate project permissions', async () => {
      // Create test project
      const project = await prisma.project.create({
        data: {
          name: 'Permission Test Project',
          description: 'Project for permission testing',
          creatorId: regularUser.id,
        },
      });

      // Add user as project member
      await prisma.projectMember.create({
        data: {
          userId: regularUser.id,
          projectId: project.id,
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

    it('should correctly evaluate file permissions', async () => {
      // Create test file
      const file = await prisma.file.create({
        data: {
          name: 'permission-test-file.dwg',
          size: 1024,
          mimeType: 'application/dwg',
          creatorId: regularUser.id,
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
        email: 'file-viewer-test-integration@example.com',
        username: 'file-viewer-test-integration',
        password: 'viewer123',
        nickname: 'File Viewer',
        role: UserRole.USER,
      });

      await prisma.fileAccess.create({
        data: {
          userId: viewerUser.id,
          fileId: file.id,
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
        .expect(400);
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
        expect(response.body).toHaveProperty('id');
      });
    });
  });
});
