///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';

describe('User Deactivation → Soft Delete → Account Restoration Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserName: string;
  let testUserPassword: string;
  let testUserId: string;
  let testUserAuthToken: string;

  let adminAuthToken: string;

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

    testUserEmail = `deactivate-${Date.now()}@example.com`;
    testUserName = `deactuser${Date.now().toString().slice(-8)}`;
    testUserPassword = 'Deactivate@123456';

    await cleanupTestData();
    await setupTestUsers();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    await prisma.refreshToken.deleteMany({});
    await prisma.fileSystemNode.deleteMany({
      where: { owner: { email: testUserEmail } },
    });
    await prisma.user.deleteMany({
      where: { email: testUserEmail },
    });
  }

  async function setupTestUsers() {
    const testUserRegister = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testUserEmail,
        username: testUserName,
        password: testUserPassword,
        nickname: 'Deactivation Test User',
      })
      .expect(201);

    testUserId = testUserRegister.body.data.user.id;
    testUserAuthToken = testUserRegister.body.data.accessToken;

    // 使用种子数据创建的系统管理员（.env INITIAL_ADMIN_*）进行恢复操作
    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        account: 'admin@example.com',
        password: 'Admin123!',
      })
      .expect(200);

    adminAuthToken = adminLogin.body.data.accessToken;
  }

  async function deactivateTestUser() {
    await request(app.getHttpServer())
      .post('/v1/users/deactivate-account')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send({
        password: testUserPassword,
      })
      .expect(200);
  }

  describe('T1: User Deactivation by Self', () => {
    it('T1-S1: Should successfully deactivate own account with password verification', async () => {
      const deactivateResponse = await request(app.getHttpServer())
        .post('/v1/users/deactivate-account')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          password: testUserPassword,
        })
        .expect(200);

      expect(deactivateResponse.body.data.message).toBeDefined();
    });

    it('T1-S2: Should verify user is soft deleted in database', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(user).toBeDefined();
      expect(user?.deletedAt).not.toBeNull();
      expect(user?.status).toBe(UserStatus.INACTIVE);
    });

    it('T1-S3: Should verify deactivated user cannot login', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: testUserPassword,
        })
        .expect(401);
    });

    it('T1-S4: Should verify deactivated user cannot access protected resources', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(401);
    });

    it('T1-S5: Should reject deactivation with incorrect password', async () => {
      const otherUserEmail = `otheruser-${Date.now()}@example.com`;
      const otherUserRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: otherUserEmail,
          username: `otheruser${Date.now().toString().slice(-8)}`,
          password: 'OtherUser@123456',
          nickname: 'Other User',
        })
        .expect(201);

      // 密码验证策略命中后 verify 失败 → UnauthorizedException → 401
      await request(app.getHttpServer())
        .post('/v1/users/deactivate-account')
        .set(
          'Authorization',
          `Bearer ${otherUserRegister.body.data.accessToken}`
        )
        .send({
          password: 'WrongPassword@123',
        })
        .expect(401);
    });
  });

  describe('T2: User Restoration by Admin', () => {
    beforeEach(async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      if (user && !user.deletedAt) {
        await deactivateTestUser();
      }
    });

    it('T2-S1: Should restore deactivated user account', async () => {
      const restoreResponse = await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      expect(restoreResponse.body.data.message).toBeDefined();
    });

    it('T2-S2: Should verify user is restored in database', async () => {
      await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      const restoredUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(restoredUser).toBeDefined();
      expect(restoredUser?.deletedAt).toBeNull();
      expect(restoredUser?.status).toBe(UserStatus.ACTIVE);
    });

    it('T2-S3: Should verify restored user can login again', async () => {
      await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserName,
          password: testUserPassword,
        })
        .expect(200);

      expect(loginResponse.body.data.accessToken).toBeDefined();
    });
  });

  describe('T3: Deactivation Verification Methods', () => {
    it('T3-S1: Should deactivate with password verification', async () => {
      const userEmail = `verification-${Date.now()}@example.com`;
      const userRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: userEmail,
          username: `verifuser${Date.now().toString().slice(-8)}`,
          password: 'Verification@123456',
          nickname: 'Verification Test User',
        })
        .expect(201);

      const verificationTestUserId = userRegister.body.data.user.id;
      const verificationTestToken = userRegister.body.data.accessToken;

      const deactivateResponse = await request(app.getHttpServer())
        .post('/v1/users/deactivate-account')
        .set('Authorization', `Bearer ${verificationTestToken}`)
        .send({
          password: 'Verification@123456',
        })
        .expect(200);

      const user = await prisma.user.findUnique({
        where: { id: verificationTestUserId },
      });

      expect(deactivateResponse.body.data.message).toBeDefined();
      expect(user?.deletedAt).not.toBeNull();
    });
  });

  describe('T4: Post-Deactivation Security', () => {
    it('T4-S1: Should reject token refresh after deactivation', async () => {
      const userEmail = `security-${Date.now()}@example.com`;
      const userRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: userEmail,
          username: `securityuser${Date.now().toString().slice(-8)}`,
          password: 'Security@123456',
          nickname: 'Security Test User',
        })
        .expect(201);

      const securityTestToken = userRegister.body.data.accessToken;

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: userEmail,
          password: 'Security@123456',
        })
        .expect(200);

      const refreshToken = loginResponse.body.data.refreshToken;

      await request(app.getHttpServer())
        .post('/v1/users/deactivate-account')
        .set('Authorization', `Bearer ${securityTestToken}`)
        .send({
          password: 'Security@123456',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken,
        })
        .expect(401);
    });
  });

  describe('T5: Complete Deactivation-Restoration Chain Integration', () => {
    it('T5-S1: Should complete full deactivation-restoration chain', async () => {
      const chainUserEmail = `chain-${Date.now()}@example.com`;
      const chainUserRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: chainUserEmail,
          username: `chainuser${Date.now().toString().slice(-8)}`,
          password: 'ChainUser@123456',
          nickname: 'Chain Test User',
        })
        .expect(201);

      const chainUserId = chainUserRegister.body.data.user.id;
      const chainUserToken = chainUserRegister.body.data.accessToken;
      const chainUserName = chainUserRegister.body.data.user.username;

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${chainUserToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/users/deactivate-account')
        .set('Authorization', `Bearer ${chainUserToken}`)
        .send({
          password: 'ChainUser@123456',
        })
        .expect(200);

      const deactivatedUser = await prisma.user.findUnique({
        where: { id: chainUserId },
      });

      expect(deactivatedUser?.deletedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post(`/v1/users/${chainUserId}/restore`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      const restoredUser = await prisma.user.findUnique({
        where: { id: chainUserId },
      });

      expect(restoredUser?.deletedAt).toBeNull();

      const loginAgainResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: chainUserName,
          password: 'ChainUser@123456',
        })
        .expect(200);

      expect(loginAgainResponse.body.data.accessToken).toBeDefined();
    });
  });
});
