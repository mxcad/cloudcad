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

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  PrismaClient,
  UserStatus,
  ProjectPermission,
  Permission,
} from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ProjectRole as ProjectRoleEnum,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../../src/common/enums/permissions.enum';
import { initIntegrationApp } from '../../src/test/integration-app';

/**
 * #297 双轨收口方案 A + #298 T1 集成测试：
 * 旧端点（/v1/roles/project-roles*）isSystem 限制 vs 新端点（/v1/projects/:projectId/project-roles*）。
 *
 * 需真实 PG + Redis（pnpm test:integration）。
 */
describe('项目角色双轨权限集成测试（#298 isSystem 限制）', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let sysAdminUser: any;
  let sysAdminToken: string;
  let ownerUserA: any;
  let ownerTokenA: string;
  let ownerUserB: any;
  let ownerTokenB: string;
  let adminMemberA: any;
  let adminMemberTokenA: string;
  let outsiderUser: any;
  let outsiderToken: string;
  let projectA: any;
  let projectB: any;
  let systemAdminRoleId: any;
  let customRoleA: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    await cleanupTestData();
    await ensureSystemRoles();
    await ensureSystemProjectRoles();
    await setupTestUsers();
    await setupTestProjects();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    await prisma.projectMember.deleteMany({});
    await prisma.projectRolePermission.deleteMany({});
    await prisma.projectRole.deleteMany({});
    await prisma.fileSystemNode.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    // 先删测试用户（引用 role），再删测试创建的角色；
    // 保留系统播种角色（ADMIN 等）——AppModule 初始化可能已创建 admin 用户引用它们
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'pr-owner-a@example.com',
            'pr-owner-b@example.com',
            'pr-admin-a@example.com',
            'pr-outsider@example.com',
            'pr-sysadmin@example.com',
          ],
        },
      },
    });
    // 只删本 spec 创建的角色（SYSTEM_ROLE_MANAGER_TEST）；
    // USER role 是通用系统角色，可能被其他测试用户引用，查重复用而非删除
    await prisma.role.deleteMany({
      where: {
        name: { in: ['SYSTEM_ROLE_MANAGER_TEST'] },
      },
    });
  }

  async function ensureSystemRoles() {
    // USER role 查重复用（可能被其他测试/残留用户引用，不能重复创建）
    const existingUserRole = await prisma.role.findFirst({
      where: { name: 'USER' },
    });
    if (!existingUserRole) {
      await prisma.role.create({
        data: {
          name: 'USER',
          description: '普通用户',
          isSystem: true,
          category: 'SYSTEM',
          level: 0,
          permissions: {
            create: [{ permission: Permission.PROJECT_CREATE }],
          },
        },
      });
    }

    // 拥有全部 SYSTEM_ROLE_* 权限的后台角色（模拟角色管理员）
    const sysRole = await prisma.role.create({
      data: {
        name: 'SYSTEM_ROLE_MANAGER_TEST',
        description: '角色管理员（测试）',
        isSystem: true,
        category: 'SYSTEM',
        level: 1,
        permissions: {
          create: [
            { permission: Permission.SYSTEM_ROLE_READ },
            { permission: Permission.SYSTEM_ROLE_CREATE },
            { permission: Permission.SYSTEM_ROLE_UPDATE },
            { permission: Permission.SYSTEM_ROLE_DELETE },
            { permission: Permission.SYSTEM_ROLE_PERMISSION_MANAGE },
            { permission: Permission.PROJECT_CREATE },
          ],
        },
      },
    });
    systemAdminRoleId = sysRole.id;
  }

  async function ensureSystemProjectRoles() {
    for (const roleName of Object.values(ProjectRoleEnum)) {
      await prisma.projectRole.create({
        data: {
          name: roleName,
          description: `系统默认角色: ${roleName}`,
          isSystem: true,
          permissions: {
            create: (DEFAULT_PROJECT_ROLE_PERMISSIONS[roleName] || []).map(
              (permission) => ({ permission })
            ),
          },
        },
      });
    }
  }

  async function setupTestUsers() {
    const userRole = await prisma.role.findFirst({ where: { name: 'USER' } });
    const hashedPassword = await bcrypt.hash('Test@123456', 10);

    const users = [
      ['pr-sysadmin@example.com', 'prsysadmin', systemAdminRoleId],
      ['pr-owner-a@example.com', 'prownera', userRole.id],
      ['pr-owner-b@example.com', 'prownerb', userRole.id],
      ['pr-admin-a@example.com', 'pradmina', userRole.id],
      ['pr-outsider@example.com', 'proutsider', userRole.id],
    ];

    for (const [email, username, roleId] of users) {
      await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          nickname: `测试用户 ${username}`,
          roleId,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    sysAdminToken = await loginAndGetToken('pr-sysadmin@example.com');
    ownerTokenA = await loginAndGetToken('pr-owner-a@example.com');
    ownerTokenB = await loginAndGetToken('pr-owner-b@example.com');
    adminMemberTokenA = await loginAndGetToken('pr-admin-a@example.com');
    outsiderToken = await loginAndGetToken('pr-outsider@example.com');
  }

  async function loginAndGetToken(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ account: email, password: 'Test@123456' })
      .expect(200);
    return response.body.data.accessToken;
  }

  async function setupTestProjects() {
    const createA = await request(app.getHttpServer())
      .post('/v1/file-system/projects')
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ name: '角色权限测试项目A', description: '项目角色双轨测试' })
      .expect(201);
    projectA = createA.body.data;

    const createB = await request(app.getHttpServer())
      .post('/v1/file-system/projects')
      .set('Authorization', `Bearer ${ownerTokenB}`)
      .send({ name: '角色权限测试项目B', description: '项目角色双轨测试' })
      .expect(201);
    projectB = createB.body.data;

    sysAdminUser = await prisma.user.findUnique({
      where: { email: 'pr-sysadmin@example.com' },
    });
    ownerUserA = await prisma.user.findUnique({
      where: { email: 'pr-owner-a@example.com' },
    });
    ownerUserB = await prisma.user.findUnique({
      where: { email: 'pr-owner-b@example.com' },
    });
    adminMemberA = await prisma.user.findUnique({
      where: { email: 'pr-admin-a@example.com' },
    });
    outsiderUser = await prisma.user.findUnique({
      where: { email: 'pr-outsider@example.com' },
    });

    const adminRole = await prisma.projectRole.findFirst({
      // ADR-00XX：成员角色必须引用项目自己的副本（项目创建时从模板复制）
      where: { name: ProjectRoleEnum.ADMIN, projectId: projectA.id },
    });
    await request(app.getHttpServer())
      .post(`/v1/file-system/projects/${projectA.id}/members`)
      .set('Authorization', `Bearer ${ownerTokenA}`)
      .send({ userId: adminMemberA.id, projectRoleId: adminRole.id })
      .expect(201);
  }

  const createRolePayload = (name: string) => ({
    name,
    description: `角色 ${name}`,
    permissions: [ProjectPermission.FILE_OPEN],
  });

  describe('T1 新端点：owner/ADMIN 可创建自定义角色', () => {
    it('T1-S1 owner 应能创建自定义角色', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/projects/${projectA.id}/project-roles`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send(createRolePayload('CUSTOM_OWNER_A'))
        .expect(201);

      expect(res.body.data.projectId).toBe(projectA.id);
      expect(res.body.data.name).toBe('CUSTOM_OWNER_A');
    });

    it('T1-S2 项目 ADMIN 成员应能创建自定义角色', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/projects/${projectA.id}/project-roles`)
        .set('Authorization', `Bearer ${adminMemberTokenA}`)
        .send(createRolePayload('CUSTOM_ADMIN_A'))
        .expect(201);

      expect(res.body.data.projectId).toBe(projectA.id);
    });
  });

  describe('T2 新端点：非项目成员 403', () => {
    it('T2-S1 非项目成员创建自定义角色应被拒绝', async () => {
      await request(app.getHttpServer())
        .post(`/v1/projects/${projectA.id}/project-roles`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send(createRolePayload('CUSTOM_OUTSIDER'))
        .expect(403);
    });
  });

  describe('T3 新端点：跨项目角色操作 403', () => {
    it('T3-S1 用项目B端点修改项目A的自定义角色应被拒绝', async () => {
      customRoleA = await prisma.projectRole.findFirst({
        where: { name: 'CUSTOM_OWNER_A', projectId: projectA.id },
      });

      await request(app.getHttpServer())
        .patch(`/v1/projects/${projectB.id}/project-roles/${customRoleA.id}`)
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .send({ description: '越权修改' })
        .expect(403);
    });
  });

  describe('T4 新端点：系统角色经项目端点被拒（#262 现状）', () => {
    it('T4-S1 项目端点修改系统角色应被拒绝', async () => {
      const systemRole = await prisma.projectRole.findFirst({
        where: { name: ProjectRoleEnum.VIEWER, isSystem: true },
      });

      await request(app.getHttpServer())
        .patch(`/v1/projects/${projectA.id}/project-roles/${systemRole.id}`)
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({ description: '修改系统角色' })
        .expect(403);
    });
  });

  describe('T5 旧端点：自定义角色一律 403（#298 isSystem 限制）', () => {
    it('T5-S1 旧端点创建带 projectId 的自定义角色应被拒绝', async () => {
      await request(app.getHttpServer())
        .post('/v1/roles/project-roles')
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({
          ...createRolePayload('CUSTOM_VIA_LEGACY'),
          projectId: projectA.id,
        })
        .expect(403);
    });

    it('T5-S2 旧端点修改自定义角色应被拒绝', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/roles/project-roles/${customRoleA.id}`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ description: '旧端点修改' })
        .expect(403);
    });

    it('T5-S3 旧端点删除自定义角色应被拒绝', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/roles/project-roles/${customRoleA.id}`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(403);
    });

    it('T5-S4 旧端点向自定义角色分配权限应被拒绝', async () => {
      await request(app.getHttpServer())
        .post(`/v1/roles/project-roles/${customRoleA.id}/permissions`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ permissions: [ProjectPermission.FILE_EDIT] })
        .expect(403);
    });

    it('T5-S5 旧端点从自定义角色移除权限应被拒绝', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/roles/project-roles/${customRoleA.id}/permissions`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ permissions: [ProjectPermission.FILE_OPEN] })
        .expect(403);
    });
  });

  describe('T6 旧端点：系统角色仍可操作（RoleManagement 系统角色 Tab 依赖）', () => {
    let legacyRoleId: string;

    it('T6-S1 旧端点可创建系统角色（无 projectId）', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/roles/project-roles')
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send(createRolePayload('LEGACY_SYSTEM_ROLE'))
        .expect(201);

      expect(res.body.data.projectId).toBeNull();
      legacyRoleId = res.body.data.id;
    });

    it('T6-S2 旧端点可修改系统角色', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/roles/project-roles/${legacyRoleId}`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ description: '旧端点修改系统角色' })
        .expect(200);

      expect(res.body.data.description).toBe('旧端点修改系统角色');
    });

    it('T6-S3 旧端点可向系统角色分配/移除权限', async () => {
      // POST 端点无 @HttpCode 装饰器，Nest 默认返回 201 Created
      await request(app.getHttpServer())
        .post(`/v1/roles/project-roles/${legacyRoleId}/permissions`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ permissions: [ProjectPermission.FILE_EDIT] })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/roles/project-roles/${legacyRoleId}/permissions`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .send({ permissions: [ProjectPermission.FILE_EDIT] })
        .expect(200);
    });

    it('T6-S4 旧端点可删除系统角色', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/roles/project-roles/${legacyRoleId}`)
        .set('Authorization', `Bearer ${sysAdminToken}`)
        .expect(200);
    });
  });
});
