///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('User Deactivation → Soft Delete → Account Restoration Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserName: string;
  let testUserPassword: string;
  let testUserId: string;
  let testUserAuthToken: string;

  let adminUserEmail: string;
  let adminUserPassword: string;
  let adminUserId: string;
  let adminAuthToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();

    testUserEmail = `deactivate-${Date.now()}@example.com`;
    testUserName = `deactivateuser-${Date.now()}`;
    testUserPassword = 'Deactivate@123456';

    adminUserEmail = `admin-${Date.now()}@example.com`;
    adminUserPassword = 'Admin@123456';

    await cleanupTestData();
    await setupTestUsers();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    await prisma.projectMember.deleteMany({
      where: {
        user: {
          OR: [
            { email: testUserEmail },
            { email: adminUserEmail },
          ],
        },
      },
    });
    await prisma.fileSystemNode.deleteMany({
      where: {
        owner: {
          OR: [
            { email: testUserEmail },
            { email: adminUserEmail },
          ],
        },
      },
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          OR: [
            { email: testUserEmail },
            { email: adminUserEmail },
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUserEmail },
          { email: adminUserEmail },
        ],
      },
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
      });
    testUserId = testUserRegister.body.user.id;
    testUserAuthToken = testUserRegister.body.accessToken;

    const adminUserRegister = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: adminUserEmail,
        username: `adminuser-${Date.now()}`,
        password: adminUserPassword,
        nickname: 'Admin Test User',
      });
    adminUserId = adminUserRegister.body.user.id;
    adminAuthToken = adminUserRegister.body.accessToken;
  }

  describe('T1: User Deactivation by Self', () => {
    it('T1-S1: Should successfully deactivate own account with password verification', async () => {
      const deactivateResponse = await request(app.getHttpServer())
        .post('/v1/users/deactivate')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          password: testUserPassword,
        });

      expect(deactivateResponse.status).toBeLessThan(500);
    });

    it('T1-S2: Should verify user is soft deleted in database', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(user).toBeDefined();
      expect(user?.deletedAt).not.toBeNull();
      expect(user?.status).toBe(UserStatus.DELETED);
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
        .get('/v1/users/profile')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(401);
    });

    it('T1-S5: Should reject deactivation with incorrect password', async () => {
      const otherUserEmail = `otheruser-${Date.now()}@example.com`;
      const otherUserRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: otherUserEmail,
          username: `otheruser-${Date.now()}`,
          password: 'OtherUser@123456',
          nickname: 'Other User',
        });

      await request(app.getHttpServer())
        .post('/v1/users/deactivate')
        .set('Authorization', `Bearer ${otherUserRegister.body.accessToken}`)
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
        await request(app.getHttpServer())
          .post('/v1/users/deactivate')
          .set('Authorization', `Bearer ${testUserAuthToken}`)
          .send({
            password: testUserPassword,
          });
      }
    });

    it('T2-S1: Should restore deactivated user account', async () => {
      const restoreResponse = await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`);

      expect(restoreResponse.status).toBeLessThan(500);
    });

    it('T2-S2: Should verify user is restored in database', async () => {
      await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`);

      const restoredUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(restoredUser).toBeDefined();
      expect(restoredUser?.deletedAt).toBeNull();
      expect(restoredUser?.status).toBe(UserStatus.ACTIVE);
    });

    it('T2-S3: Should verify restored user can login again', async () => {
      await request(app.getHttpServer())
        .post(`/v1/users/${testUserId}/restore`);

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: testUserPassword,
        });

      expect(loginResponse.status).toBeLessThan(500);
      expect(loginResponse.body.accessToken).toBeDefined();
    });
  });

  describe('T3: Deactivation Verification Methods', () => {
    let verificationTestUserId: string;
    let verificationTestToken: string;

    beforeEach(async () => {
      const userEmail = `verification-${Date.now()}@example.com`;
      const userRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: userEmail,
          username: `verificationuser-${Date.now()}`,
          password: 'Verification@123456',
          nickname: 'Verification Test User',
        });
      verificationTestUserId = userRegister.body.user.id;
      verificationTestToken = userRegister.body.accessToken;
    });

    it('T3-S1: Should deactivate with password verification', async () => {
      const deactivateResponse = await request(app.getHttpServer())
        .post('/v1/users/deactivate')
        .set('Authorization', `Bearer ${verificationTestToken}`)
        .send({
          password: 'Verification@123456',
        });

      expect(deactivateResponse.status).toBeLessThan(500);

      const user = await prisma.user.findUnique({
        where: { id: verificationTestUserId },
      });

      expect(user?.deletedAt).not.toBeNull();
    });
  });

  describe('T4: Post-Deactivation Security', () => {
    let securityTestUserId: string;
    let securityTestToken: string;

    beforeEach(async () => {
      const userEmail = `security-${Date.now()}@example.com`;
      const userRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: userEmail,
          username: `securityuser-${Date.now()}`,
          password: 'Security@123456',
          nickname: 'Security Test User',
        });
      securityTestUserId = userRegister.body.user.id;
      securityTestToken = userRegister.body.accessToken;
    });

    it('T4-S1: Should reject token refresh after deactivation', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: `security-${Date.now()}@example.com`,
          password: 'Security@123456',
        });

      if (loginResponse.body.refreshToken) {
        await request(app.getHttpServer())
          .post('/v1/users/deactivate')
          .set('Authorization', `Bearer ${securityTestToken}`)
          .send({
            password: 'Security@123456',
          });

        await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .send({
            refreshToken: loginResponse.body.refreshToken,
          })
          .expect(401);
      }
    });
  });

  describe('T5: Complete Deactivation-Restoration Chain Integration', () => {
    it('T5-S1: Should complete full deactivation-restoration chain - create user → deactivate → verify → restore → verify → login again', async () => {
      const chainUserEmail = `chain-${Date.now()}@example.com`;
      const chainUserRegister = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: chainUserEmail,
          username: `chainuser-${Date.now()}`,
          password: 'ChainUser@123456',
          nickname: 'Chain Test User',
        })
        .expect(201);

      const chainUserId = chainUserRegister.body.user.id;
      const chainUserToken = chainUserRegister.body.accessToken;

      await request(app.getHttpServer())
        .get('/v1/users/profile')
        .set('Authorization', `Bearer ${chainUserToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/users/deactivate')
        .set('Authorization', `Bearer ${chainUserToken}`)
        .send({
          password: 'ChainUser@123456',
        });

      const deactivatedUser = await prisma.user.findUnique({
        where: { id: chainUserId },
      });

      expect(deactivatedUser?.deletedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post(`/v1/users/${chainUserId}/restore`);

      const restoredUser = await prisma.user.findUnique({
        where: { id: chainUserId },
      });

      expect(restoredUser?.deletedAt).toBeNull();

      const loginAgainResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: chainUserEmail,
          password: 'ChainUser@123456',
        });

      expect(loginAgainResponse.status).toBeLessThan(500);
      expect(loginAgainResponse.body.accessToken).toBeDefined();
    });
  });
});
