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
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { PrismaClient, UserStatus, Permission } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  ProjectRole as ProjectRoleEnum,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../../src/common/enums/permissions.enum';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from '../../src/config/configuration';
import { DatabaseModule } from '../../src/database/database.module';
import { RedisModule } from '../../src/redis/redis.module';
import { CacheArchitectureModule } from '../../src/cache-architecture/cache-architecture.module';
import { CommonModule } from '../../src/common/common.module';
import { GlobalExceptionFilter } from '../../src/common/filters/exception.filter';
import { PrismaExceptionFilter } from '../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { CustomValidationPipe } from '../../src/common/pipes/validation.pipe';
import { RateLimitGuard } from '../../src/common/guards/rate-limit.guard';
import { JwtStrategyExecutor } from '../../src/auth/jwt.strategy.executor';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { AppService } from '../../src/app.service';
import { AuthModule } from '../../src/auth/auth.module';
import { RolesModule } from '../../src/roles/roles.module';
import { PermissionModule } from '../../src/permission/permission.module';
import { FileSystemModule } from '../../src/file-system/file-system.module';
import { StorageModule } from '../../src/storage/storage.module';
import { AuditLogModule } from '../../src/audit/audit-log.module';
import { VersionControlModule } from '../../src/version-control/version-control.module';
import { RuntimeConfigModule } from '../../src/runtime-config/runtime-config.module';
import { VipModule } from '../../src/vip/vip.module';
import { BillingModule } from '../../src/billing/billing.module';
import { I18nModule } from '../../src/common/i18n/i18n.module';
import { initIntegrationApp } from '../../src/test/integration-app';

// Redis：不使用自写 mock —— src/test/setup.ts 已全局 jest.mock('ioredis')
// 提供带 setex/eval/scan/pub-sub 语义的 in-memory MockRedis（redis.module 的
// new Redis(...) 自动拿到共享实例），此处无需 overrideProvider。

describe('项目生命周期集成测试', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  
  let testUser: Record<string, unknown>;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        RedisModule,
        CacheArchitectureModule,
        AuthModule.forRoot(),
        CommonModule,
        RolesModule,
        FileSystemModule,
        StorageModule,
        AuditLogModule,
        VersionControlModule,
        RuntimeConfigModule,
        VipModule,
        BillingModule,
        I18nModule,
        PermissionModule,
      ],
      providers: [
        AppService,
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        { provide: APP_PIPE, useClass: CustomValidationPipe },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: JwtStrategyExecutor },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    })
      .compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    // 先清理测试数据，再直接播种系统默认项目角色（PROJECT_OWNER 等，isSystem=true）——
    // 原实现调用 projectRolesService.createSystemDefaultRoles() 但 ProjectRolesService.create
    // 忽略 isSystem 字段（落库 isSystem=false），project-crud 查 isSystem:true 必然 500；
    // 且原顺序「先播种后清理」会被 cleanupTestData 的 projectRole.deleteMany 清掉。
    await cleanupTestData();
    await ensureSystemProjectRoles();

    // 准备测试用户
    await setupTestUsers();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    // 删除项目相关数据
    await prisma.projectMember.deleteMany({});
    await prisma.fileSystemNode.deleteMany({});
    await prisma.projectRole.deleteMany({});
    await prisma.projectRolePermission.deleteMany({});
    
    // 删除用户相关数据
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test-user@example.com', 'test-admin@example.com'],
        },
      },
    });
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
    // 创建普通用户角色
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

    // 创建管理员角色
    let adminRole = await prisma.role.findFirst({
      where: { name: 'ADMIN' },
    });
    
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          name: 'ADMIN',
          description: '系统管理员',
          isSystem: true,
          category: 'SYSTEM',
          level: 100,
        },
      });
      
      // 为管理员分配权限
      const adminPermissions = [
        Permission.SYSTEM_USER_READ,
        Permission.SYSTEM_USER_CREATE,
        Permission.SYSTEM_USER_UPDATE,
        Permission.SYSTEM_USER_DELETE,
        Permission.SYSTEM_ROLE_READ,
        Permission.SYSTEM_ROLE_CREATE,
        Permission.SYSTEM_ROLE_UPDATE,
        Permission.SYSTEM_ROLE_DELETE,
        Permission.PROJECT_CREATE,
        Permission.LIBRARY_DRAWING_MANAGE,
      ];
      
      await prisma.rolePermission.createMany({
        data: adminPermissions.map(p => ({
          roleId: adminRole.id,
          permission: p,
        })),
      });
    }

    // 创建普通用户
    const hashedPassword = await bcrypt.hash('Test@123456', 10);
    
    testUser = await prisma.user.create({
      data: {
        email: 'test-user@example.com',
        username: 'testuser',
        password: hashedPassword,
        nickname: '测试用户',
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // 登录获取 token（登录端点 @HttpCode(HttpStatus.OK)，断言 200）
    const userLoginResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        account: 'test-user@example.com',
        password: 'Test@123456',
      })
      .expect(200);
    
    authToken = userLoginResponse.body.data.accessToken;
  }

  describe('测试用例1：完整的项目创建流程', () => {
    it('应该能够成功创建项目', async () => {
      const projectName = '测试项目1';
      const projectDescription = '这是一个测试项目描述';
      
      const response = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: projectName,
          description: projectDescription,
        })
        .expect(201);

      expect(response.body).toBeDefined();
      // ResponseInterceptor 统一包装 { code, message, data }，项目对象在 data 内
      // （createProject 返回原始 fileSystemNode，无 isFolder/isRoot 派生字段）
      const project = response.body.data;
      expect(project.id).toBeDefined();
      expect(project.name).toBe(projectName);
      expect(project.description).toBe(projectDescription);
      expect(project.nodeType).toBe('PROJECT');
      expect(project.parentId).toBeNull();
      expect(project.projectStatus).toBe('ACTIVE');
      expect(project.ownerId).toBe(testUser.id);
    });

    it('创建项目后应该能够获取项目列表', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.data.nodes)).toBe(true);
      expect(response.body.data.nodes.length).toBeGreaterThan(0);
    });

    it('创建的项目应该能够作为根节点被查询到', async () => {
      // 先创建一个项目
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '根节点测试项目',
          description: '用于测试根节点功能的项目',
        })
        .expect(201);

      const projectId = createResponse.body.data.id;

      // 获取项目详情
      const getResponse = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body).toBeDefined();
      expect(getResponse.body.data.id).toBe(projectId);
      expect(getResponse.body.data.nodeType).toBe('PROJECT');
    });
  });

  describe('测试用例2：项目配额管理流程', () => {
    let testProjectId: string;

    beforeEach(async () => {
      // 使用唯一项目名：beforeEach 每用例执行一次，同名项目会被名称唯一性校验拒绝（400）
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `配额测试项目-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description: '用于测试配额管理功能的项目',
        })
        .expect(201);
      
      testProjectId = createResponse.body.data.id;
    });

    afterEach(async () => {
      // 软删测试项目：VIP0 默认 max_projects=5，不清理会触发项目数量配额 403
      if (testProjectId) {
        await request(app.getHttpServer())
          .delete(`/v1/file-system/nodes/${testProjectId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
        testProjectId = '';
      }
    });

    it('应该能够获取项目的初始配额信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/file-system/quota')
        .query({ nodeId: testProjectId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data.type).toBeDefined();
      expect(response.body.data.used).toBeDefined();
      expect(typeof response.body.data.used).toBe('number');
      expect(response.body.data.total).toBeDefined();
      expect(typeof response.body.data.total).toBe('number');
    });

    it('管理员应该能够查询项目配额', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/file-system/quota')
        .query({ nodeId: testProjectId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data.type).toBeDefined();
      expect(response.body.data.total).toBeDefined();
      expect(typeof response.body.data.total).toBe('number');
    });
  });

  describe('测试用例3：完整的项目生命周期管理', () => {
    let projectId: string;

    it('应该能够完成从创建到查看再到删除的完整生命周期', async () => {
      // 步骤1：创建项目
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '完整生命周期项目',
          description: '测试完整的项目生命周期',
        })
        .expect(201);

      projectId = createResponse.body.data.id;
      expect(projectId).toBeDefined();

      // 步骤2：查看项目详情（确认是根节点）
      const getResponse = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.data.id).toBe(projectId);
      expect(getResponse.body.data.nodeType).toBe('PROJECT');

      // 步骤3：查看配额信息
      const quotaResponse = await request(app.getHttpServer())
        .get('/v1/file-system/quota')
        .query({ nodeId: projectId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(quotaResponse.body.data.total).toBeDefined();
      expect(typeof quotaResponse.body.data.total).toBe('number');

      // 步骤4：删除项目（软删除）
      await request(app.getHttpServer())
        .delete(`/v1/file-system/nodes/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // 步骤5：确认项目不在活跃列表中
      const listResponse = await request(app.getHttpServer())
        .get('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const activeProjects = listResponse.body.data.nodes;
      const deletedProject = activeProjects.find((p: Record<string, unknown>) => p.id === projectId);
      expect(deletedProject).toBeUndefined();
    });
  });

  describe('测试用例4：项目根节点的特殊属性验证', () => {
    it('创建的项目节点应该具有正确的根节点属性', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '根节点属性测试',
          description: '测试项目根节点的属性',
        })
        .expect(201);

      const project = createResponse.body.data;
      
      // 验证根节点属性（createProject 返回原始节点：nodeType 与 parentId 等价于 isRoot/isFolder）
      expect(project.nodeType).toBe('PROJECT');
      expect(project.parentId).toBeNull();
      expect(project.projectStatus).toBe('ACTIVE');
    });

    it('项目创建后应该正确关联创建者', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '创建者测试项目',
        })
        .expect(201);

      const projectId = createResponse.body.data.id;

      // 验证项目成员列表中包含创建者
      const membersResponse = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(membersResponse.body.data)).toBe(true);
      expect(membersResponse.body.data.length).toBeGreaterThan(0);
      
      // getProjectMembers 返回扁平结构（id/email/username/...），无嵌套 user 对象
      const creatorMember = membersResponse.body.data.find(
        (m: Record<string, unknown>) => m.id === testUser.id
      );
      expect(creatorMember).toBeDefined();
    });
  });
});
