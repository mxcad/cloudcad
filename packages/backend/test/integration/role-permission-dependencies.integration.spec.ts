///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';

/**
 * 权限前置依赖自动补全集成测试（真实 PG）
 *
 * 覆盖用户核心需求："从机制上杜绝无效权限组合"——
 * 无论权限从 UI 还是直连 API 写入，服务端保存角色权限时自动补全缺失的前置权限，
 * 数据库永远不出现"能创建但看不到角色"这类组合。
 *
 * 场景：
 *  T1 创建角色只传 SYSTEM_ROLE_CREATE → 自动补 SYSTEM_ROLE_READ
 *  T2 更新角色只传 SYSTEM_CONFIG_WRITE → 自动补 SYSTEM_CONFIG_READ
 *  T3 为角色分配权限只传 SYSTEM_BILLING_WRITE → 自动补 SYSTEM_BILLING_READ
 *  T4 创建角色只传 SYSTEM_USER_CREATE → 自动补 SYSTEM_USER_READ + SYSTEM_ROLE_READ（用户管理角色下拉依赖）
 */

// 测试账号密码：仅用于集成测试环境创建的临时用户，非生产凭据；
// 可通过 TEST_ADMIN_PASSWORD 环境变量覆盖
const testAdminPassword = process.env.TEST_ADMIN_PASSWORD ?? 'Test@123456';

describe('Role Permission Dependencies Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const adminEmail = `perm-admin-${Date.now()}@example.com`;
  const adminUsername = `permadmin${Date.now().toString().slice(-8)}`;
  let adminToken = '';

  const createdRoleIds: string[] = [];

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

    await setupAdminUser();
  }, 60000);

  afterAll(async () => {
    // 清理测试角色与测试用户
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.user.deleteMany({
      where: { email: adminEmail },
    });
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  /** 复用系统 ADMIN 角色（初始化已含全部系统权限），为其挂一个测试用户并登录 */
  async function setupAdminUser(): Promise<void> {
    let adminRole = await prisma.role.findFirst({ where: { name: 'ADMIN' } });
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
    }

    const hashedPassword = await bcrypt.hash(testAdminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminUsername,
        password: hashedPassword,
        nickname: '权限集成测试管理员',
        roleId: adminRole.id,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: testAdminPassword })
      .expect(200);
    adminToken = login.body.data.accessToken as string;
    expect(adminToken).toBeDefined();
  }

  /** 读取角色在 DB 中的实际权限（大写枚举值） */
  async function getRolePermissions(roleId: string): Promise<string[]> {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: true },
    });
    return rows.map((r) => r.permission);
  }

  it('T1 创建角色只传"创建角色"权限 → DB 自动补"查看角色"', async () => {
    const roleName = `DEP_AUTO_${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: roleName,
        description: '依赖自动补全测试角色',
        permissions: ['SYSTEM_ROLE_CREATE'],
      })
      .expect(201);

    const roleId = res.body.data.id as string;
    createdRoleIds.push(roleId);

    const permissions = await getRolePermissions(roleId);
    expect(permissions).toEqual(
      expect.arrayContaining(['SYSTEM_ROLE_CREATE', 'SYSTEM_ROLE_READ'])
    );
  });

  it('T2 更新角色只传"修改配置"权限 → DB 自动补"查看配置"', async () => {
    const roleName = `DEP_AUTO_UPDATE_${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: roleName,
        description: '依赖自动补全更新测试',
        permissions: ['SYSTEM_ROLE_READ'],
      })
      .expect(201);
    const roleId = createRes.body.data.id as string;
    createdRoleIds.push(roleId);

    await request(app.getHttpServer())
      .patch(`/v1/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: ['SYSTEM_CONFIG_WRITE'] })
      .expect(200);

    const permissions = await getRolePermissions(roleId);
    expect(permissions).toEqual(
      expect.arrayContaining(['SYSTEM_CONFIG_WRITE', 'SYSTEM_CONFIG_READ'])
    );
  });

  it('T3 分配权限只传"管理支付" → DB 自动补"查看支付管理"', async () => {
    const roleName = `DEP_AUTO_ADD_${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: roleName,
        description: '依赖自动补全分配测试',
        permissions: ['SYSTEM_ROLE_READ'],
      })
      .expect(201);
    const roleId = createRes.body.data.id as string;
    createdRoleIds.push(roleId);

    await request(app.getHttpServer())
      .post(`/v1/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: ['SYSTEM_BILLING_WRITE'] })
      .expect(200);

    const permissions = await getRolePermissions(roleId);
    expect(permissions).toEqual(
      expect.arrayContaining(['SYSTEM_BILLING_WRITE', 'SYSTEM_BILLING_READ'])
    );
  });

  it('T4 创建角色只传"创建用户" → DB 自动补"查看用户"+"查看角色"', async () => {
    const roleName = `DEP_AUTO_USER_${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: roleName,
        description: '用户管理角色下拉依赖测试',
        permissions: ['SYSTEM_USER_CREATE'],
      })
      .expect(201);

    const roleId = res.body.data.id as string;
    createdRoleIds.push(roleId);

    const permissions = await getRolePermissions(roleId);
    expect(permissions).toEqual(
      expect.arrayContaining([
        'SYSTEM_USER_CREATE',
        'SYSTEM_USER_READ',
        'SYSTEM_ROLE_READ',
      ])
    );
  });
});
