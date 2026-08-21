///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';

describe('User Password Change → Old Password Validation → Token Not Invalidated Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserName: string;
  let originalPassword: string;
  let newPassword: string;
  let testUserId: string;
  let testUserAuthToken: string;

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

    testUserEmail = `pwd-test-${Date.now()}@example.com`;
    testUserName = `pwduser${Date.now().toString().slice(-8)}`;
    originalPassword = 'Original@123456';
    newPassword = 'NewPassword@123456';

    await cleanupTestData();
    await setupTestUser();
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

  async function setupTestUser() {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testUserEmail,
        username: testUserName,
        password: originalPassword,
        nickname: 'Password Test User',
      });

    testUserId = registerResponse.body.data.user.id;
    testUserAuthToken = registerResponse.body.data.accessToken;
  }

  describe('T1: Password Change Flow', () => {
    it('T1-S1: Should successfully change password with correct old password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          oldPassword: originalPassword,
          newPassword: newPassword,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data.message).toBeDefined();
    });

    it('T1-S2: Should verify password is updated in database', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
      });

      expect(user).toBeDefined();
      const isNewPasswordValid = await bcrypt.compare(
        newPassword,
        user?.password || ''
      );
      expect(isNewPasswordValid).toBe(true);
    });

    it('T1-S3: Should login with new password after change', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: newPassword,
        })
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('T1-S4: Should reject password change with empty old password', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          oldPassword: '',
          newPassword: 'AnotherNewPassword@123',
        })
        .expect(400);
    });

    it('T1-S5: Should reject password change with weak new password', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          oldPassword: newPassword,
          newPassword: '123',
        })
        .expect(400);
    });
  });

  describe('T2: Token Validity After Password Change', () => {
    let freshToken: string;
    let currentPassword: string;

    beforeAll(() => {
      currentPassword = newPassword;
    });

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: currentPassword,
        });
      freshToken = loginResponse.body.data.accessToken;
    });

    it('T2-S1: Should access protected resources with existing token after password change', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({
          oldPassword: newPassword,
          newPassword: 'AnotherValidPassword@123',
        });

      currentPassword = 'AnotherValidPassword@123';

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);
    });

    it('T2-S2: Should reject token refresh after password change (refresh tokens revoked)', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: currentPassword,
        });

      const accessToken = loginResponse.body.data.accessToken;
      const refreshToken = loginResponse.body.data.refreshToken;

      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          oldPassword: currentPassword,
          newPassword: newPassword,
        });

      currentPassword = newPassword;

      const refreshResponse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(401);
    });
  });

  describe('T3: Password Change Security Validations', () => {
    let securityTestToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: newPassword,
        });
      securityTestToken = loginResponse.body.data.accessToken;
    });

    it('T3-S1: Should reject password change without authorization header', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .send({
          oldPassword: newPassword,
          newPassword: 'NewSecurePassword@123',
        })
        .expect(401);
    });

    it('T3-S2: Should reject password change with invalid token', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          oldPassword: newPassword,
          newPassword: 'NewSecurePassword@123',
        })
        .expect(401);
    });

    it('T3-S3: Should reject password change with empty old password', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${securityTestToken}`)
        .send({
          oldPassword: '',
          newPassword: 'NewSecurePassword@123',
        })
        .expect(400);
    });

    it('T3-S4: Should reject password change with empty new password', async () => {
      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${securityTestToken}`)
        .send({
          oldPassword: newPassword,
          newPassword: '',
        })
        .expect(400);
    });
  });

  describe('T4: Complete Password Change Chain Integration', () => {
    it('T4-S1: Should complete full password change chain - login → change password → verify → use new password → use existing token', async () => {
      const firstLoginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: newPassword,
        })
        .expect(200);

      const firstAccessToken = firstLoginResponse.body.data.accessToken;

      const chainNewPassword = 'ChainNewPassword@123';

      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${firstAccessToken}`)
        .send({
          oldPassword: newPassword,
          newPassword: chainNewPassword,
        })
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${firstAccessToken}`)
        .expect(200);

      const secondLoginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: chainNewPassword,
        })
        .expect(200);

      const secondAccessToken = secondLoginResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${secondAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/users/change-password')
        .set('Authorization', `Bearer ${secondAccessToken}`)
        .send({
          oldPassword: chainNewPassword,
          newPassword: newPassword,
        })
        .expect(200);
    });
  });
});
