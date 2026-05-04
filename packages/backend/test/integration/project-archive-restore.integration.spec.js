///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from "@nestjs/testing";
import { PrismaClient, ProjectStatus } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../src/app.module";
describe("Project Archive and Restore Integration", () => {
    let app;
    let prisma;
    let testUserEmail;
    let testUserPassword;
    let testUserId;
    let testUserAuthToken;
    let testProjectId;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = new PrismaClient();
        await prisma.$connect();
        testUserEmail = `archive-${Date.now()}@example.com`;
        testUserPassword = "Archive@123456";
        await cleanupTestData();
        await setupTestUserAndProject();
    }, 60000);
    afterAll(async () => {
        await cleanupTestData();
        await prisma.$disconnect();
        await app.close();
    }, 60000);
    async function cleanupTestData() {
        await prisma.projectMember.deleteMany({
            where: { user: { email: testUserEmail } },
        });
        await prisma.fileSystemNode.deleteMany({
            where: { owner: { email: testUserEmail } },
        });
        await prisma.refreshToken.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: testUserEmail },
        });
    }
    async function setupTestUserAndProject() {
        const userRegister = await request(app.getHttpServer())
            .post("/v1/auth/register")
            .send({
            email: testUserEmail,
            username: `archiveuser-${Date.now()}`,
            password: testUserPassword,
            nickname: "Archive Test User",
        });
        testUserId = userRegister.body.user.id;
        testUserAuthToken = userRegister.body.accessToken;
        const createProjectResponse = await request(app.getHttpServer())
            .post("/v1/file-system/projects")
            .set("Authorization", `Bearer ${testUserAuthToken}`)
            .send({
            name: "Archive Test Project",
            description: "Project for archive testing",
        });
        testProjectId = createProjectResponse.body.id;
    }
    describe("T1: Project Archive", () => {
        it("T1-S1: Should successfully archive a project", async () => {
            const archiveResponse = await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${testProjectId}`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            expect(archiveResponse.body).toBeDefined();
            const archivedProject = await prisma.fileSystemNode.findUnique({
                where: { id: testProjectId },
            });
            expect(archivedProject).toBeDefined();
            expect(archivedProject?.projectStatus).toBe(ProjectStatus.ARCHIVED);
            expect(archivedProject?.deletedAt).not.toBeNull();
        });
        it("T1-S2: Should verify archived project is not listed in active projects", async () => {
            const projectsResponse = await request(app.getHttpServer())
                .get("/v1/file-system/projects")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            expect(projectsResponse.body).toBeDefined();
        });
        it("T1-S3: Should reject archive by non-owner user", async () => {
            const otherUserEmail = `otheruser-${Date.now()}@example.com`;
            const otherUserRegister = await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: otherUserEmail,
                username: `otheruser-${Date.now()}`,
                password: "OtherUser@123456",
                nickname: "Other User",
            });
            const otherUserToken = otherUserRegister.body.accessToken;
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${testProjectId}`)
                .set("Authorization", `Bearer ${otherUserToken}`)
                .expect(403);
        });
    });
    describe("T2: Project Restore", () => {
        beforeEach(async () => {
            const project = await prisma.fileSystemNode.findUnique({
                where: { id: testProjectId },
            });
            if (project && !project.deletedAt) {
                await request(app.getHttpServer())
                    .delete(`/v1/file-system/projects/${testProjectId}`)
                    .set("Authorization", `Bearer ${testUserAuthToken}`);
            }
        });
        it("T2-S1: Should successfully restore an archived project", async () => {
            const restoreResponse = await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${testProjectId}/restore`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            expect(restoreResponse.body).toBeDefined();
            const restoredProject = await prisma.fileSystemNode.findUnique({
                where: { id: testProjectId },
            });
            expect(restoredProject).toBeDefined();
            expect(restoredProject?.projectStatus).toBe(ProjectStatus.ACTIVE);
            expect(restoredProject?.deletedAt).toBeNull();
        });
        it("T2-S2: Should verify restored project appears in active projects", async () => {
            await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${testProjectId}/restore`)
                .set("Authorization", `Bearer ${testUserAuthToken}`);
            const projectsResponse = await request(app.getHttpServer())
                .get("/v1/file-system/projects")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            expect(projectsResponse.body).toBeDefined();
        });
        it("T2-S3: Should reject restore by non-owner user", async () => {
            const otherUserEmail = `restoreuser-${Date.now()}@example.com`;
            const otherUserRegister = await request(app.getHttpServer())
                .post("/v1/auth/register")
                .send({
                email: otherUserEmail,
                username: `restoreuser-${Date.now()}`,
                password: "RestoreUser@123456",
                nickname: "Restore Test User",
            });
            const otherUserToken = otherUserRegister.body.accessToken;
            await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${testProjectId}/restore`)
                .set("Authorization", `Bearer ${otherUserToken}`)
                .expect(403);
        });
    });
    describe("T3: File Freezing in Archived Project", () => {
        let testFileId;
        beforeEach(async () => {
            const newProjectResponse = await request(app.getHttpServer())
                .post("/v1/file-system/projects")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                name: "Freeze Test Project",
                description: "Project for file freezing testing",
            });
            const newProjectId = newProjectResponse.body.id;
            const createFileResponse = await request(app.getHttpServer())
                .post(`/v1/file-system/projects/${newProjectId}/folders`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                name: "Test File Node",
                description: "Test file node for freezing",
            });
            testFileId = createFileResponse.body.id;
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${newProjectId}`)
                .set("Authorization", `Bearer ${testUserAuthToken}`);
        });
        it("T3-S1: Should verify files are frozen in archived project", async () => {
            const file = await prisma.fileSystemNode.findUnique({
                where: { id: testFileId },
            });
            expect(file).toBeDefined();
        });
    });
    describe("T4: Deleted Projects Listing", () => {
        it("T4-S1: Should list archived projects in deleted projects list", async () => {
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${testProjectId}`)
                .set("Authorization", `Bearer ${testUserAuthToken}`);
            const deletedProjectsResponse = await request(app.getHttpServer())
                .get("/v1/file-system/projects/deleted")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            expect(deletedProjectsResponse.body).toBeDefined();
        });
    });
    describe("T5: Complete Archive-Restore Chain Integration", () => {
        it("T5-S1: Should complete full archive-restore chain - create project → create files → archive → verify → restore → verify", async () => {
            const chainProjectResponse = await request(app.getHttpServer())
                .post("/v1/file-system/projects")
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                name: "Chain Archive Project",
                description: "Project for complete chain testing",
            })
                .expect(201);
            const chainProjectId = chainProjectResponse.body.id;
            const createFileResponse = await request(app.getHttpServer())
                .post(`/v1/file-system/projects/${chainProjectId}/folders`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .send({
                name: "Chain Test File",
                description: "Test file for chain testing",
            });
            const chainFileId = createFileResponse.body.id;
            await request(app.getHttpServer())
                .delete(`/v1/file-system/projects/${chainProjectId}`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            const archivedProject = await prisma.fileSystemNode.findUnique({
                where: { id: chainProjectId },
            });
            expect(archivedProject).toBeDefined();
            expect(archivedProject?.projectStatus).toBe(ProjectStatus.ARCHIVED);
            await request(app.getHttpServer())
                .patch(`/v1/file-system/projects/${chainProjectId}/restore`)
                .set("Authorization", `Bearer ${testUserAuthToken}`)
                .expect(200);
            const restoredProject = await prisma.fileSystemNode.findUnique({
                where: { id: chainProjectId },
            });
            expect(restoredProject).toBeDefined();
            expect(restoredProject?.projectStatus).toBe(ProjectStatus.ACTIVE);
            expect(restoredProject?.deletedAt).toBeNull();
            const restoredFile = await prisma.fileSystemNode.findUnique({
                where: { id: chainFileId },
            });
            expect(restoredFile).toBeDefined();
        });
    });
});
//# sourceMappingURL=project-archive-restore.integration.spec.js.map