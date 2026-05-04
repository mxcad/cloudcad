///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../src/app.module";
describe("Permission Allocation → Cache Clearing → Permission Effectiveness Integration", () => {
    let app;
    let prisma;
    let ownerEmail;
    let memberEmail;
    let ownerPassword;
    let memberPassword;
    let ownerId;
    let memberId;
    let ownerToken;
    let memberToken;
    let testProjectId;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = new PrismaClient();
        await prisma.$connect();
        ownerEmail = `owner-${Date.now()}@example.com`;
        memberEmail = `member-${Date.now()}@example.com`;
        ownerPassword = "Owner@123456";
        memberPassword = "Member@123456";
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
                OR: [{ user: { email: ownerEmail } }, { user: { email: memberEmail } }],
            },
        });
        await prisma.fileSystemNode.deleteMany({
            where: {
                OR: [
                    { owner: { email: ownerEmail } },
                    { owner: { email: memberEmail } },
                ],
            },
        });
        await prisma.refreshToken.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                OR: [{ email: ownerEmail }, { email: memberEmail }],
            },
        });
    }
    async function setupTestUsers() {
        const ownerRegister = await request(app.getHttpServer())
            .post("/v1/auth/register")
            .send({
            email: ownerEmail,
            username: `owneruser-${Date.now()}`,
            password: ownerPassword,
            nickname: "Project Owner",
        });
        ownerId = ownerRegister.body.user.id;
        ownerToken = ownerRegister.body.accessToken;
        const memberRegister = await request(app.getHttpServer())
            .post("/v1/auth/register")
            .send({
            email: memberEmail,
            username: `memberuser-${Date.now()}`,
            password: memberPassword,
            nickname: "Project Member",
        });
        memberId = memberRegister.body.user.id;
        memberToken = memberRegister.body.accessToken;
    }
    describe("T1: Project Creation and Initial Permission Setup", () => {
        it("T1-S1: Should create project with owner having full permissions", async () => {
            const createProjectResponse = await request(app.getHttpServer())
                .post("/v1/file-system/projects")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                name: "Permission Test Project",
                description: "Project for permission testing",
            })
                .expect(201);
            testProjectId = createProjectResponse.body.id;
        });
        it("T1-S2: Should verify project owner has PROJECT_OWNER role", async () => {
            const ownerMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: testProjectId,
                    userId: ownerId,
                },
                include: {
                    projectRole: true,
                },
            });
            expect(ownerMember).toBeDefined();
            expect(ownerMember?.projectRole?.name).toBe("PROJECT_OWNER");
        });
    });
    describe("T2: Adding Project Member with Role", () => {
        let viewerRoleId;
        beforeAll(async () => {
            const viewerRole = await prisma.projectRole.findFirst({
                where: { name: "PROJECT_VIEWER" },
            });
            viewerRoleId = viewerRole?.id || "";
        });
        it("T2-S1: Should add member to project with viewer role", async () => {
            const addMemberResponse = await request(app.getHttpServer())
                .post(`/v1/file-system/projects/${testProjectId}/members`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                userId: memberId,
                projectRoleId: viewerRoleId,
            })
                .expect(201);
            expect(addMemberResponse.body).toBeDefined();
            expect(addMemberResponse.body.user.id).toBe(memberId);
        });
        it("T2-S2: Should verify member is added with correct role", async () => {
            const projectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: testProjectId,
                    userId: memberId,
                },
                include: {
                    projectRole: true,
                },
            });
            expect(projectMember).toBeDefined();
            expect(projectMember?.projectRole?.name).toBe("PROJECT_VIEWER");
        });
        it("T2-S3: Should verify member can access project with viewer permissions", async () => {
            const permissionsResponse = await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${testProjectId}/permissions`)
                .set("Authorization", `Bearer ${memberToken}`)
                .expect(200);
            expect(permissionsResponse.body.permissions).toBeDefined();
        });
    });
    describe("T3: Updating Member Role", () => {
        let editorRoleId;
        beforeAll(async () => {
            const editorRole = await prisma.projectRole.findFirst({
                where: { name: "PROJECT_EDITOR" },
            });
            editorRoleId = editorRole?.id || "";
        });
        it("T3-S1: Should update member role from viewer to editor", async () => {
            const updateRoleResponse = await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${testProjectId}/members/${memberId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                projectRoleId: editorRoleId,
            })
                .expect(200);
            expect(updateRoleResponse.body).toBeDefined();
            expect(updateRoleResponse.body.projectRoleId).toBe(editorRoleId);
        });
        it("T3-S2: Should verify role is updated in database", async () => {
            const projectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: testProjectId,
                    userId: memberId,
                },
                include: {
                    projectRole: true,
                },
            });
            expect(projectMember?.projectRole?.name).toBe("PROJECT_EDITOR");
        });
        it("T3-S3: Should verify new permissions are effective after role change", async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const permissionsResponse = await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${testProjectId}/permissions`)
                .set("Authorization", `Bearer ${memberToken}`)
                .expect(200);
            expect(permissionsResponse.body.permissions).toBeDefined();
        });
    });
    describe("T4: Removing Member from Project", () => {
        it("T4-S1: Should remove member from project", async () => {
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${testProjectId}/members/${memberId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(200);
        });
        it("T4-S2: Should verify member is removed from database", async () => {
            const projectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: testProjectId,
                    userId: memberId,
                },
            });
            expect(projectMember).toBeNull();
        });
        it("T4-S3: Should verify removed member cannot access project", async () => {
            await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${testProjectId}/permissions`)
                .set("Authorization", `Bearer ${memberToken}`)
                .expect(403);
        });
    });
    describe("T5: Permission Denied Testing", () => {
        let anotherProjectId;
        beforeAll(async () => {
            const createProject = await request(app.getHttpServer())
                .post("/v1/file-system/projects")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                name: "Another Project",
                description: "Another project for permission testing",
            });
            anotherProjectId = createProject.body.id;
        });
        it("T5-S1: Should deny access to project without membership", async () => {
            await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${anotherProjectId}`)
                .set("Authorization", `Bearer ${memberToken}`)
                .expect(403);
        });
        it("T5-S2: Should deny member management by non-owner/non-admin", async () => {
            const viewerRole = await prisma.projectRole.findFirst({
                where: { name: "PROJECT_VIEWER" },
            });
            await request(app.getHttpServer())
                .post(`/v1/file-system/projects/${testProjectId}/members`)
                .set("Authorization", `Bearer ${memberToken}`)
                .send({
                userId: ownerId,
                projectRoleId: viewerRole?.id || "",
            })
                .expect(403);
        });
    });
    describe("T6: Complete Permission Allocation Chain Integration", () => {
        it("T6-S1: Should complete full permission chain - create project → add member → change role → remove member → verify permissions", async () => {
            const chainProjectResponse = await request(app.getHttpServer())
                .post("/v1/file-system/projects")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                name: "Chain Permission Project",
                description: "Project for complete permission chain testing",
            })
                .expect(201);
            const chainProjectId = chainProjectResponse.body.id;
            const viewerRole = await prisma.projectRole.findFirst({
                where: { name: "PROJECT_VIEWER" },
            });
            const editorRole = await prisma.projectRole.findFirst({
                where: { name: "PROJECT_EDITOR" },
            });
            await request(app.getHttpServer())
                .post(`/v1/file-system/projects/${chainProjectId}/members`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                userId: memberId,
                projectRoleId: viewerRole?.id || "",
            })
                .expect(201);
            await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${chainProjectId}/members/${memberId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                projectRoleId: editorRole?.id || "",
            })
                .expect(200);
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${chainProjectId}/members/${memberId}`)
                .set("Authorization", `Bearer ${ownerToken}`)
                .expect(200);
            await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${chainProjectId}/permissions`)
                .set("Authorization", `Bearer ${memberToken}`)
                .expect(403);
        });
    });
});
//# sourceMappingURL=permission-allocation-cache.integration.spec.js.map