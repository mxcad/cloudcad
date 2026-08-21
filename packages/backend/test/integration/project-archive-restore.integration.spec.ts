///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, ProjectStatus } from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { initIntegrationApp } from "../../src/test/integration-app";

describe("Project Archive and Restore Integration", () => {
	let app: INestApplication;
	let prisma: PrismaClient;

	let testUserEmail: string;
	let testUserPassword: string;
	let testUserId: string;
	let testUserAuthToken: string;
	let testProjectId: string;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = initIntegrationApp(moduleFixture.createNestApplication());
		await app.init();

		prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
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
				username: `archiveuser${Date.now().toString().slice(-8)}`,
				password: testUserPassword,
				nickname: "Archive Test User",
			});

		testUserId = userRegister.body.data.user.id;
		testUserAuthToken = userRegister.body.data.accessToken;

		const createProjectResponse = await request(app.getHttpServer())
			.post("/v1/file-system/projects")
			.set("Authorization", `Bearer ${testUserAuthToken}`)
			.send({
				name: "Archive Test Project",
				description: "Project for archive testing",
			});

		testProjectId = createProjectResponse.body.data.id;
	}

	async function archiveProject(projectId: string) {
		const project = await prisma.fileSystemNode.findUnique({
			where: { id: projectId },
		});
		if (project && !project.deletedAt) {
			await request(app.getHttpServer())
				.delete(`/v1/file-system/projects/${projectId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`);
		}
	}

	async function registerOtherUser(prefix: string) {
		const otherUserRegister = await request(app.getHttpServer())
			.post("/v1/auth/register")
			.send({
				email: `${prefix}-${Date.now()}@example.com`,
				username: `${prefix}${Date.now().toString().slice(-8)}`,
				password: "OtherUser@123456",
				nickname: "Other User",
			});

		return otherUserRegister.body.data.accessToken;
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
			expect(archivedProject?.projectStatus).toBe(ProjectStatus.DELETED);
			expect(archivedProject?.deletedAt).not.toBeNull();
		});

		it("T1-S2: Should verify archived project is not listed in active projects", async () => {
			const projectsResponse = await request(app.getHttpServer())
				.get("/v1/file-system/projects")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.expect(200);

			expect(projectsResponse.body).toBeDefined();
			const nodes = projectsResponse.body.data.nodes || [];
			expect(nodes.some((n: { id: string }) => n.id === testProjectId)).toBe(false);
		});

		it("T1-S3: Should reject archive by non-owner user", async () => {
			const otherUserToken = await registerOtherUser("otheruser");

			const freshProjectResponse = await request(app.getHttpServer())
				.post("/v1/file-system/projects")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Archive Non-Owner Project",
				});

			const freshProjectId = freshProjectResponse.body.data.id;

			await request(app.getHttpServer())
				.delete(`/v1/file-system/projects/${freshProjectId}`)
				.set("Authorization", `Bearer ${otherUserToken}`)
				.expect(403);
		});
	});

	describe("T2: Project Restore", () => {
		beforeEach(async () => {
			await archiveProject(testProjectId);
		});

		it("T2-S1: Should successfully restore an archived project", async () => {
			const restoreResponse = await request(app.getHttpServer())
				.post("/v1/file-system/trash/restore")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({ itemIds: [testProjectId] })
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
				.post("/v1/file-system/trash/restore")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({ itemIds: [testProjectId] })
				.expect(200);

			const projectsResponse = await request(app.getHttpServer())
				.get("/v1/file-system/projects")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.expect(200);

			expect(projectsResponse.body).toBeDefined();
			const nodes = projectsResponse.body.data.nodes || [];
			expect(nodes.some((n: { id: string }) => n.id === testProjectId)).toBe(true);
		});

		it("T2-S3: Should reject restore by non-owner user", async () => {
			const otherUserToken = await registerOtherUser("restoreuser");

			await request(app.getHttpServer())
				.post("/v1/file-system/trash/restore")
				.set("Authorization", `Bearer ${otherUserToken}`)
				.send({ itemIds: [testProjectId] })
				.expect(403);
		});
	});

	describe("T3: File Freezing in Archived Project", () => {
		let testFileId: string;

		beforeEach(async () => {
			const newProjectResponse = await request(app.getHttpServer())
				.post("/v1/file-system/projects")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: `Freeze Test Project ${Date.now()}`,
				});

			const newProjectId = newProjectResponse.body.data.id;

			const createFileResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${newProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Test File Node",
				});

			testFileId = createFileResponse.body.data.id;

			await request(app.getHttpServer())
				.delete(`/v1/file-system/projects/${newProjectId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`);
		});

		it("T3-S1: Should verify files are frozen in archived project", async () => {
			const file = await prisma.fileSystemNode.findUnique({
				where: { id: testFileId },
			});

			expect(file).toBeDefined();
			expect(file?.deletedAt).not.toBeNull();
		});
	});

	describe("T4: Deleted Projects Listing", () => {
		it("T4-S1: Should list archived projects in deleted projects list", async () => {
			await archiveProject(testProjectId);

			const deletedProjectsResponse = await request(app.getHttpServer())
				.get("/v1/file-system/projects/trash")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.expect(200);

			expect(deletedProjectsResponse.body).toBeDefined();
			const nodes = deletedProjectsResponse.body.data.nodes || [];
			expect(nodes.some((n: { id: string }) => n.id === testProjectId)).toBe(true);
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

			const chainProjectId = chainProjectResponse.body.data.id;

			const createFileResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${chainProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Chain Test File",
				});

			const chainFileId = createFileResponse.body.data.id;

			await request(app.getHttpServer())
				.delete(`/v1/file-system/projects/${chainProjectId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.expect(200);

			const archivedProject = await prisma.fileSystemNode.findUnique({
				where: { id: chainProjectId },
			});

			expect(archivedProject).toBeDefined();
			expect(archivedProject?.projectStatus).toBe(ProjectStatus.DELETED);

			await request(app.getHttpServer())
				.post("/v1/file-system/trash/restore")
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({ itemIds: [chainProjectId] })
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
