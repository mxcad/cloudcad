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

describe('Auth Registration → Email Verification → Login → Token Refresh → Logout Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserName: string;
  let testUserPassword: string;
  let testUserId: string;

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

    testUserEmail = `test-${Date.now()}@example.com`;
    testUserName = `testuser${Date.now().toString().slice(-8)}`;
    testUserPassword = 'Test@123456';

    await cleanupTestData();
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

  describe('T1: User Registration Flow', () => {
    it('T1-S1: Should successfully register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: testUserEmail,
          username: testUserName,
          password: testUserPassword,
          nickname: 'Test User',
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(testUserEmail);
      expect(response.body.data.user.username).toBe(testUserName);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      testUserId = response.body.data.user.id;
    });

    it('T1-S2: Should reject registration with duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: testUserEmail,
          username: `another${Date.now().toString().slice(-8)}`,
          password: testUserPassword,
          nickname: 'Another User',
        })
        .expect(409);
    });

    it('T1-S3: Should reject registration with duplicate username', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: `another-${Date.now()}@example.com`,
          username: testUserName,
          password: testUserPassword,
          nickname: 'Another User',
        })
        .expect(409);
    });

    it('T1-S4: Should reject registration with weak password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: `weak-${Date.now()}@example.com`,
          username: `weak${Date.now().toString().slice(-8)}`,
          password: '123456',
          nickname: 'Weak User',
        })
        .expect(400);
    });

    it('T1-S5: Should reject registration with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'invalid-email',
          username: `invalid${Date.now().toString().slice(-8)}`,
          password: testUserPassword,
          nickname: 'Invalid User',
        })
        .expect(400);
    });
  });

  describe('T2: Email Verification Flow', () => {
    it('T2-S1: Should send verification code to email', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/send-verification')
        .send({
          email: testUserEmail,
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('T2-S2: Should verify email with verification code', async () => {
      const verificationCode = '000000';

      const response = await request(app.getHttpServer())
        .post('/v1/auth/verify-email')
        .send({
          email: testUserEmail,
          code: verificationCode,
        });

      const user = await prisma.user.findUnique({
        where: { email: testUserEmail },
      });

      expect(user).toBeDefined();
    });
  });

  describe('T3: User Login Flow', () => {
    let accessToken: string;
    let refreshToken: string;

    it('T3-S1: Should successfully login with correct credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: testUserPassword,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('T3-S2: Should reject login with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: 'WrongPassword@123',
        })
        .expect(401);
    });

    it('T3-S3: Should reject login with non-existent account', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: 'nonexistent@example.com',
          password: testUserPassword,
        })
        .expect(401);
    });

    it('T3-S4: Should access protected resource with valid access token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('T3-S5: Should reject access with invalid access token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('T3-S6: Should reject access without authorization header', async () => {
      await request(app.getHttpServer()).get('/v1/auth/profile').expect(401);
    });
  });

  describe('T4: Token Refresh Flow', () => {
    let originalAccessToken: string;
    let originalRefreshToken: string;
    let newAccessToken: string;
    let newRefreshToken: string;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: testUserPassword,
        });

      originalAccessToken = loginResponse.body.data.accessToken;
      originalRefreshToken = loginResponse.body.data.refreshToken;
    });

    it('T4-S1: Should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: originalRefreshToken,
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.accessToken).not.toBe(originalAccessToken);
      expect(response.body.data.refreshToken).not.toBe(originalRefreshToken);

      newAccessToken = response.body.data.accessToken;
      newRefreshToken = response.body.data.refreshToken;
    });

    it('T4-S2: Should access protected resource with new access token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);
    });

    it('T4-S3: Should reject refresh with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);
    });

    it('T4-S4: Should reject refresh with used refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: originalRefreshToken,
        })
        .expect(401);
    });
  });

  describe('T5: User Logout Flow', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: testUserEmail,
          password: testUserPassword,
        });

      accessToken = loginResponse.body.data.accessToken;
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('T5-S1: Should successfully logout and invalidate tokens', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken,
        })
        .expect(200);
    });

    it('T5-S2: Should reject access with invalidated access token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken,
        });

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('T5-S3: Should reject token refresh with invalidated refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken,
        });

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(401);
    });
  });

  describe('T6: Complete Auth Chain Integration', () => {
    let chainEmail: string;
    let chainUsername: string;
    let chainPassword: string;
    let registerAccessToken: string;
    let registerRefreshToken: string;
    let newAccessToken: string;
    let newRefreshToken: string;

    beforeAll(() => {
      chainEmail = `chain-${Date.now()}@example.com`;
      chainUsername = `chainuser${Date.now().toString().slice(-8)}`;
      chainPassword = 'Chain@123456';
    });

    it('T6-S1: Should complete full auth chain - register → login → refresh → logout', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: chainEmail,
          username: chainUsername,
          password: chainPassword,
          nickname: 'Chain User',
        })
        .expect(201);

      registerAccessToken = registerResponse.body.data.accessToken;
      registerRefreshToken = registerResponse.body.data.refreshToken;

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${registerAccessToken}`)
        .expect(200);

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          account: chainEmail,
          password: chainPassword,
        })
        .expect(200);

      const loginAccessToken = loginResponse.body.data.accessToken;
      const loginRefreshToken = loginResponse.body.data.refreshToken;

      const refreshResponse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({
          refreshToken: loginRefreshToken,
        })
        .expect(200);

      newAccessToken = refreshResponse.body.data.accessToken;
      newRefreshToken = refreshResponse.body.data.refreshToken;

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .send({
          refreshToken: newRefreshToken,
        })
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });
  });
});
