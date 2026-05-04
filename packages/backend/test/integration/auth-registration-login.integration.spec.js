///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../src/app.module";
describe("Auth Registration → Email Verification → Login → Token Refresh → Logout Integration", () => {
    let app;
    let prisma;
    let testUserEmail;
    let testUserName;
    let testUserPassword;
    let testUserId;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = new PrismaClient();
        await prisma.$connect();
        testUserEmail = `test-${Date.now()}@example.com`;
        testUserName = `testuser-${Date.now()}`;
        testUserPassword = "Test@123456";
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
    describe("T1: User Registration Flow", () => {
        it("T1-S1: Should successfully register a new user", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: testUserEmail,
                username: testUserName,
                password: testUserPassword,
                nickname: "Test User",
            })
                .expect(201);
            expect(response.body).toBeDefined();
            expect(response.body.user).toBeDefined();
            expect(response.body.user.email).toBe(testUserEmail);
            expect(response.body.user.username).toBe(testUserName);
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            testUserId = response.body.user.id;
        });
        it("T1-S2: Should reject registration with duplicate email", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: testUserEmail,
                username: `another-${Date.now()}`,
                password: testUserPassword,
                nickname: "Another User",
            })
                .expect(409);
        });
        it("T1-S3: Should reject registration with duplicate username", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: `another-${Date.now()}@example.com`,
                username: testUserName,
                password: testUserPassword,
                nickname: "Another User",
            })
                .expect(409);
        });
        it("T1-S4: Should reject registration with weak password", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: `weak-${Date.now()}@example.com`,
                username: `weak-${Date.now()}`,
                password: "123456",
                nickname: "Weak User",
            })
                .expect(400);
        });
        it("T1-S5: Should reject registration with invalid email format", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: "invalid-email",
                username: `invalid-${Date.now()}`,
                password: testUserPassword,
                nickname: "Invalid User",
            })
                .expect(400);
        });
    });
    describe("T2: Email Verification Flow", () => {
        it("T2-S1: Should send verification code to email", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/auth/send-verification")
                .send({
                email: testUserEmail,
                type: "register",
            })
                .expect(200);
            expect(response.body).toBeDefined();
        });
        it("T2-S2: Should verify email with verification code", async () => {
            const verificationCode = "000000";
            const response = await request(app.getHttpServer())
                .post("/v1/auth/verify-email")
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
    describe("T3: User Login Flow", () => {
        let accessToken;
        let refreshToken;
        it("T3-S1: Should successfully login with correct credentials", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: testUserPassword,
            })
                .expect(201);
            expect(response.body).toBeDefined();
            expect(response.body.user).toBeDefined();
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            accessToken = response.body.accessToken;
            refreshToken = response.body.refreshToken;
        });
        it("T3-S2: Should reject login with wrong password", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: "WrongPassword@123",
            })
                .expect(401);
        });
        it("T3-S3: Should reject login with non-existent account", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: "nonexistent@example.com",
                password: testUserPassword,
            })
                .expect(401);
        });
        it("T3-S4: Should access protected resource with valid access token", async () => {
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(200);
        });
        it("T3-S5: Should reject access with invalid access token", async () => {
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", "Bearer invalid-token")
                .expect(401);
        });
        it("T3-S6: Should reject access without authorization header", async () => {
            await request(app.getHttpServer()).get("/v1/users/profile").expect(401);
        });
    });
    describe("T4: Token Refresh Flow", () => {
        let originalAccessToken;
        let originalRefreshToken;
        let newAccessToken;
        let newRefreshToken;
        beforeAll(async () => {
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: testUserPassword,
            });
            originalAccessToken = loginResponse.body.accessToken;
            originalRefreshToken = loginResponse.body.refreshToken;
        });
        it("T4-S1: Should refresh access token with valid refresh token", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: originalRefreshToken,
            })
                .expect(201);
            expect(response.body).toBeDefined();
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            expect(response.body.accessToken).not.toBe(originalAccessToken);
            expect(response.body.refreshToken).not.toBe(originalRefreshToken);
            newAccessToken = response.body.accessToken;
            newRefreshToken = response.body.refreshToken;
        });
        it("T4-S2: Should access protected resource with new access token", async () => {
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${newAccessToken}`)
                .expect(200);
        });
        it("T4-S3: Should reject refresh with invalid refresh token", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: "invalid-refresh-token",
            })
                .expect(401);
        });
        it("T4-S4: Should reject refresh with used refresh token", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: originalRefreshToken,
            })
                .expect(401);
        });
    });
    describe("T5: User Logout Flow", () => {
        let accessToken;
        let refreshToken;
        beforeEach(async () => {
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: testUserPassword,
            });
            accessToken = loginResponse.body.accessToken;
            refreshToken = loginResponse.body.refreshToken;
        });
        it("T5-S1: Should successfully logout and invalidate tokens", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/logout")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                refreshToken: refreshToken,
            })
                .expect(200);
        });
        it("T5-S2: Should reject access with invalidated access token", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/logout")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                refreshToken: refreshToken,
            });
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${accessToken}`)
                .expect(401);
        });
        it("T5-S3: Should reject token refresh with invalidated refresh token", async () => {
            await request(app.getHttpServer())
                .post("/v1/auth/logout")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                refreshToken: refreshToken,
            });
            await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: refreshToken,
            })
                .expect(401);
        });
    });
    describe("T6: Complete Auth Chain Integration", () => {
        let chainEmail;
        let chainUsername;
        let chainPassword;
        let registerAccessToken;
        let registerRefreshToken;
        let newAccessToken;
        let newRefreshToken;
        beforeAll(() => {
            chainEmail = `chain-${Date.now()}@example.com`;
            chainUsername = `chainuser-${Date.now()}`;
            chainPassword = "Chain@123456";
        });
        it("T6-S1: Should complete full auth chain - register → login → refresh → logout", async () => {
            const registerResponse = await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: chainEmail,
                username: chainUsername,
                password: chainPassword,
                nickname: "Chain User",
            })
                .expect(201);
            registerAccessToken = registerResponse.body.accessToken;
            registerRefreshToken = registerResponse.body.refreshToken;
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${registerAccessToken}`)
                .expect(200);
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: chainEmail,
                password: chainPassword,
            })
                .expect(201);
            const loginAccessToken = loginResponse.body.accessToken;
            const loginRefreshToken = loginResponse.body.refreshToken;
            const refreshResponse = await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: loginRefreshToken,
            })
                .expect(201);
            newAccessToken = refreshResponse.body.accessToken;
            newRefreshToken = refreshResponse.body.refreshToken;
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${newAccessToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .post("/v1/auth/logout")
                .set("Authorization", `Bearer ${newAccessToken}`)
                .send({
                refreshToken: newRefreshToken,
            })
                .expect(200);
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${newAccessToken}`)
                .expect(401);
        });
    });
});
//# sourceMappingURL=auth-registration-login.integration.spec.js.map