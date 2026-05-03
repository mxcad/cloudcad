///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide Technology
// Co., Ltd. to use this software, its documentation, or related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaClient, UserStatus, ProjectPermission } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ProjectRolesService } from '../../src/roles/project-roles.service';

describe('项目成员管理集成测试', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let projectRolesService: ProjectRolesService;

  let testOwner: any;
  let testMember1: any;
  let testMember2: any;
  let testProject: any;
  let ownerAuthToken: string;
  let member1AuthToken: string;
  let member2AuthToken: string;
  let ownerProjectRole: any;
  let adminProjectRole: any;
  let editorProjectRole: any;
  let viewerProjectRole: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();

    projectRolesService = moduleFixture.get<ProjectRolesService>(ProjectRolesService);

    try {
      await projectRolesService.createSystemDefaultRoles();
    } catch (error) {
    }

    await cleanupTestData();

    const systemRoles = await prisma.projectRole.findMany({
      where: { isSystem: true },
    });

    ownerProjectRole = systemRoles.find(r => r.name === 'PROJECT_OWNER');
    adminProjectRole = systemRoles.find(r => r.name === 'PROJECT_ADMIN');
    editorProjectRole = systemRoles.find(r => r.name === 'PROJECT_EDITOR');
    viewerProjectRole = systemRoles.find(r => r.name === 'PROJECT_VIEWER');

    await setupTestUsers();
    await setupTestProject();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    await prisma.projectMember.deleteMany({});
    await prisma.fileSystemNode.deleteMany({});
    await prisma.projectRole.deleteMany({});
    await prisma.projectRolePermission.deleteMany({});

    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-owner@example.com', 'test-member1@example.com', 'test-member2@example.com'],
        },
      },
    });
  }

  async function setupTestUsers() {
    let userRole = await prisma.role.findFirst({
      where: { name: 'USER' },
    });

    if (!userRole) {
      userRole = await prisma.role.create({
        data: {
          name: 'USER',
          description: '普通用户',
          isSystem: true,
          category: 'SYSTEM',
          level: 0,
        },
      });
    }

    const hashedPassword = await bcrypt.hash('Test@123456', 10);

    testOwner = await prisma.user.create({
      data: {
        email: 'test-owner@example.com',
        username: 'testowner',
        password: hashedPassword,
        nickname: '测试项目所有者',
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    testMember1 = await prisma.user.create({
      data: {
        email: 'test-member1@example.com',
        username: 'testmember1',
        password: hashedPassword,
        nickname: '测试成员1',
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    testMember2 = await prisma.user.create({
      data: {
        email: 'test-member2@example.com',
        username: 'testmember2',
        password: hashedPassword,
        nickname: '测试成员2',
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    const ownerLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        account: 'test-owner@example.com',
        password: 'Test@123456',
      })
      .expect(201);

    ownerAuthToken = ownerLoginResponse.body.accessToken;

    const member1LoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        account: 'test-member1@example.com',
        password: 'Test@123456',
      })
      .expect(201);

    member1AuthToken = member1LoginResponse.body.accessToken;

    const member2LoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        account: 'test-member2@example.com',
        password: 'Test@123456',
      })
      .expect(201);

    member2AuthToken = member2LoginResponse.body.accessToken;
  }

  async function setupTestProject() {
    const createProjectResponse = await request(app.getHttpServer())
      .post('/v1/file-system/projects')
      .set('Authorization', `Bearer ${ownerAuthToken}`)
      .send({
        name: '项目成员测试项目',
        description: '用于测试项目成员管理功能的项目',
      })
      .expect(201);

    testProject = createProjectResponse.body;
  }

  describe('测试用例1：添加项目成员', () => {
    it('应该能够成功添加项目成员1为编辑者', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          userId: testMember1.id,
          projectRoleId: editorProjectRole.id,
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.user.id).toBe(testMember1.id);
      expect(response.body.projectRoleId).toBe(editorProjectRole.id);
      expect(response.body.projectRoleName).toBe('PROJECT_EDITOR');
    });

    it('应该能够成功添加项目成员2为查看者', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          userId: testMember2.id,
          projectRoleId: viewerProjectRole.id,
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.user.id).toBe(testMember2.id);
      expect(response.body.projectRoleName).toBe('PROJECT_VIEWER');
    });

    it('添加重复成员应该失败', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          userId: testMember1.id,
          projectRoleId: editorProjectRole.id,
        })
        .expect(403);
    });

    it('没有权限的用户应该无法添加成员', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .send({
          userId: testOwner.id,
          projectRoleId: viewerProjectRole.id,
        })
        .expect(403);
    });

    it('添加成员后应该能够在成员列表中看到', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(2);

      const member1 = response.body.find((m: any) => m.user && m.user.id === testMember1.id);
      const member2 = response.body.find((m: any) => m.user && m.user.id === testMember2.id);

      expect(member1).toBeDefined();
      expect(member2).toBeDefined();
    });
  });

  describe('测试用例2：修改成员角色', () => {
    it('应该能够成功修改成员2的角色为管理员', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${testProject.id}/members/${testMember2.id}`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          projectRoleId: adminProjectRole.id,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.user.id).toBe(testMember2.id);
      expect(response.body.projectRoleId).toBe(adminProjectRole.id);
      expect(response.body.projectRoleName).toBe('PROJECT_ADMIN');
    });

    it('修改角色后权限应该相应变化', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions/check`)
        .set('Authorization', `Bearer ${member2AuthToken}`)
        .query({ permission: ProjectPermission.PROJECT_MEMBER_MANAGE })
        .expect(200);

      expect(response.body.hasPermission).toBe(true);
    });

    it('不能修改项目所有者的角色', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${testProject.id}/members/${testOwner.id}`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          projectRoleId: adminProjectRole.id,
        })
        .expect(403);
    });

    it('没有权限的用户应该无法修改成员角色', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${testProject.id}/members/${testMember1.id}`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .send({
          projectRoleId: adminProjectRole.id,
        })
        .expect(403);
    });
  });

  describe('测试用例3：移除项目成员', () => {
    it('应该能够成功移除成员1', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${testProject.id}/members/${testMember1.id}`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.message).toContain('成功');
    });

    it('移除成员后成员不应该再出现在列表中', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .expect(200);

      const member1 = response.body.find((m: any) => m.user && m.user.id === testMember1.id);
      expect(member1).toBeUndefined();
    });

    it('移除成员后该成员应该没有项目权限', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions/check`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .query({ permission: ProjectPermission.FILE_OPEN })
        .expect(200);

      expect(response.body.hasPermission).toBe(false);
    });

    it('不能移除项目所有者', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${testProject.id}/members/${testOwner.id}`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .expect(403);
    });

    it('没有权限的用户应该无法移除成员', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${testProject.id}/members/${testMember2.id}`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .expect(403);
    });
  });

  describe('测试用例4：转让项目所有权（通过服务层）', () => {
    it('先重新添加成员1为管理员', async () => {
      await request(app.getHttpServer())
        .post(`/v1/file-system/projects/${testProject.id}/members`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .send({
          userId: testMember1.id,
          projectRoleId: adminProjectRole.id,
        })
        .expect(201);
    });

    it('应该能够成功转让所有权给成员1', async () => {
      const projectMemberService = app.get('ProjectMemberService');

      const result = await projectMemberService.transferProjectOwnership(
        testProject.id,
        testMember1.id,
        testOwner.id
      );

      expect(result).toBeDefined();
      expect(result.message).toContain('成功');
    });

    it('转让所有权后成员1应该成为新的所有者', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/role`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .expect(200);

      expect(response.body.role).toBe('PROJECT_OWNER');
    });

    it('转让所有权后原所有者应该成为管理员', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/role`)
        .set('Authorization', `Bearer ${ownerAuthToken}`)
        .expect(200);

      expect(response.body.role).toBe('PROJECT_ADMIN');
    });

    it('新所有者应该具有所有项目权限', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .expect(200);

      expect(response.body.permissions).toBeInstanceOf(Array);
      expect(response.body.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('测试用例5：权限检查验证', () => {
    it('查看者应该只具有读取权限', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${testProject.id}/members/${testMember2.id}`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .send({
          projectRoleId: viewerProjectRole.id,
        })
        .expect(200);

      const fileOpenResponse = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions/check`)
        .set('Authorization', `Bearer ${member2AuthToken}`)
        .query({ permission: ProjectPermission.FILE_OPEN })
        .expect(200);

      expect(fileOpenResponse.body.hasPermission).toBe(true);

      const fileCreateResponse = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions/check`)
        .set('Authorization', `Bearer ${member2AuthToken}`)
        .query({ permission: ProjectPermission.FILE_CREATE })
        .expect(200);

      expect(fileCreateResponse.body.hasPermission).toBe(false);
    });

    it('应该能够获取用户在项目中的所有权限', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${testProject.id}/permissions`)
        .set('Authorization', `Bearer ${member1AuthToken}`)
        .expect(200);

      expect(response.body.permissions).toBeInstanceOf(Array);
      expect(response.body.permissions.length).toBeGreaterThan(0);
    });
  });
});
