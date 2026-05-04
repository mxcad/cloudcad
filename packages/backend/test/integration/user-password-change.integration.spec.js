///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../../src/app.module";
describe("User Password Change → Old Password Validation → Token Not Invalidated Integration", () => {
    let app;
    let prisma;
    let testUserEmail;
    let testUserName;
    let originalPassword;
    let newPassword;
    let testUserId;
    let testUserAuthToken;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = new PrismaClient();
        await prisma.$connect();
        testUserEmail = `pwd-test-${Date.now()}@example.com`;
        testUserName = `pwduser-${Date.now()}`;
        originalPassword = "Original@123456";
        newPassword = "NewPassword@123456";
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
            .post("/v1/auth/register")
            .send({
            email: testUserEmail,
            username: testUserName,
            password: originalPassword,
            nickname: "Password Test User",
        });
        testUserId = registerResponse.body.user.id;
        testUserAuthToken = registerResponse.body.accessToken;
    }
    describe("T1: Password Change Flow", () => {
        it("T1-S1: Should successfully change password with correct old password", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                oldPassword: originalPassword,
                newPassword: newPassword,
            })
                .expect(200);
            expect(response.body).toBeDefined();
            expect(response.body.message).toContain("success");
        });
        it("T1-S2: Should verify password is updated in database", async () => {
            const user = await prisma.user.findUnique({
                where: { id: testUserId },
            });
            expect(user).toBeDefined();
            const isNewPasswordValid = await bcrypt.compare(newPassword, user?.password || "");
            expect(isNewPasswordValid).toBe(true);
        });
        it("T1-S3: Should login with new password after change", async () => {
            const response = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: newPassword,
            })
                .expect(201);
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
        });
        it("T1-S4: Should reject password change with incorrect old password", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                oldPassword: "WrongOldPassword@123",
                newPassword: "AnotherNewPassword@123",
            })
                .expect(401);
        });
        it("T1-S5: Should reject password change with weak new password", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                oldPassword: newPassword,
                newPassword: "123456",
            })
                .expect(400);
        });
    });
    describe("T2: Token Validity After Password Change", () => {
        let freshToken;
        beforeEach(async () => {
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: newPassword,
            });
            freshToken = loginResponse.body.accessToken;
        });
        it("T2-S1: Should access protected resources with existing token after password change", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${freshToken}`)
                .send({
                oldPassword: newPassword,
                newPassword: "AnotherValidPassword@123",
            });
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${freshToken}`)
                .expect(200);
        });
        it("T2-S2: Should refresh token with existing refresh token after password change", async () => {
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: "AnotherValidPassword@123",
            });
            const accessToken = loginResponse.body.accessToken;
            const refreshToken = loginResponse.body.refreshToken;
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${accessToken}`)
                .send({
                oldPassword: "AnotherValidPassword@123",
                newPassword: newPassword,
            });
            const refreshResponse = await request(app.getHttpServer())
                .post("/v1/auth/refresh")
                .send({
                refreshToken: refreshToken,
            })
                .expect(201);
            expect(refreshResponse.body.accessToken).toBeDefined();
        });
    });
    describe("T3: Password Change Security Validations", () => {
        let securityTestToken;
        beforeEach(async () => {
            const loginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: newPassword,
            });
            securityTestToken = loginResponse.body.accessToken;
        });
        it("T3-S1: Should reject password change without authorization header", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .send({
                oldPassword: newPassword,
                newPassword: "NewSecurePassword@123",
            })
                .expect(401);
        });
        it("T3-S2: Should reject password change with invalid token", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", "Bearer invalid-token")
                .send({
                oldPassword: newPassword,
                newPassword: "NewSecurePassword@123",
            })
                .expect(401);
        });
        it("T3-S3: Should reject password change with empty old password", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${securityTestToken}`)
                .send({
                oldPassword: "",
                newPassword: "NewSecurePassword@123",
            })
                .expect(400);
        });
        it("T3-S4: Should reject password change with empty new password", async () => {
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${securityTestToken}`)
                .send({
                oldPassword: newPassword,
                newPassword: "",
            })
                .expect(400);
        });
    });
    describe("T4: Complete Password Change Chain Integration", () => {
        it("T4-S1: Should complete full password change chain - login → change password → verify → use new password → use existing token", async () => {
            const firstLoginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: newPassword,
            })
                .expect(201);
            const firstAccessToken = firstLoginResponse.body.accessToken;
            const chainNewPassword = "ChainNewPassword@123";
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${firstAccessToken}`)
                .send({
                oldPassword: newPassword,
                newPassword: chainNewPassword,
            })
                .expect(200);
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${firstAccessToken}`)
                .expect(200);
            const secondLoginResponse = await request(app.getHttpServer())
                .post("/v1/auth/login")
                .send({
                account: testUserEmail,
                password: chainNewPassword,
            })
                .expect(201);
            const secondAccessToken = secondLoginResponse.body.accessToken;
            await request(app.getHttpServer())
                .get("/v1/users/profile")
                .set("Authorization", `Bearer ${secondAccessToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .post("/v1/users/change-password")
                .set("Authorization", `Bearer ${secondAccessToken}`)
                .send({
                oldPassword: chainNewPassword,
                newPassword: newPassword,
            })
                .expect(200);
        });
    });
});
//# sourceMappingURL=user-password-change.integration.spec.js.map