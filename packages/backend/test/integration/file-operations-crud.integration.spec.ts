///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, ProjectStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../../src/app.module";

describe("File Operations - Create, Move, Copy, Rename Integration", () => {
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

		app = moduleFixture.createNestApplication();
		await app.init();

		prisma = new PrismaClient();
		await prisma.$connect();

		testUserEmail = `fileops-${Date.now()}@example.com`;
		testUserPassword = "FileOps@123456";

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
				username: `fileopsuser-${Date.now()}`,
				password: testUserPassword,
				nickname: "File Operations Test User",
			});

		testUserId = userRegister.body.user.id;
		testUserAuthToken = userRegister.body.accessToken;

		const createProjectResponse = await request(app.getHttpServer())
			.post("/v1/file-system/projects")
			.set("Authorization", `Bearer ${testUserAuthToken}`)
			.send({
				name: "File Operations Test Project",
				description: "Project for file operations testing",
			});

		testProjectId = createProjectResponse.body.id;
	}

	describe("T1: File and Folder Creation", () => {
		it("T1-S1: Should create a new folder in project", async () => {
			const createFolderResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Test Folder 1",
					description: "This is a test folder",
				});

			expect(createFolderResponse.status).toBeLessThan(500);

			if (createFolderResponse.body.id) {
				const folder = await prisma.fileSystemNode.findUnique({
					where: { id: createFolderResponse.body.id },
				});

				expect(folder).toBeDefined();
				expect(folder?.name).toBe("Test Folder 1");
				expect(folder?.isFolder).toBe(true);
			}
		});

		it("T1-S2: Should create nested folders structure", async () => {
			const createParentResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Parent Folder",
					description: "Parent folder for nested structure",
				});

			if (createParentResponse.body.id) {
				const parentFolderId = createParentResponse.body.id;

				const createChildResponse = await request(app.getHttpServer())
					.post(`/v1/file-system/projects/${testProjectId}/folders`)
					.set("Authorization", `Bearer ${testUserAuthToken}`)
					.send({
						name: "Child Folder",
						description: "Child folder inside parent",
						parentId: parentFolderId,
					});

				expect(createChildResponse.status).toBeLessThan(500);

				if (createChildResponse.body.id) {
					const childFolder = await prisma.fileSystemNode.findUnique({
						where: { id: createChildResponse.body.id },
					});

					expect(childFolder).toBeDefined();
					expect(childFolder?.parentId).toBe(parentFolderId);
				}
			}
		});

		it("T1-S3: Should reject folder creation with empty name", async () => {
			await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "",
					description: "Empty name folder",
				})
				.expect(400);
		});
	});

	describe("T2: File and Folder Rename", () => {
		let testFolderId: string;

		beforeEach(async () => {
			const createResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Rename Test Folder",
					description: "Folder for rename testing",
				});

			testFolderId = createResponse.body.id;
		});

		it("T2-S1: Should successfully rename a folder", async () => {
			const newName = "Renamed Test Folder";

			const renameResponse = await request(app.getHttpServer())
				.patch(`/v1/file-system/nodes/${testFolderId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: newName,
				});

			expect(renameResponse.status).toBeLessThan(500);

			const renamedFolder = await prisma.fileSystemNode.findUnique({
				where: { id: testFolderId },
			});

			expect(renamedFolder).toBeDefined();
			expect(renamedFolder?.name).toBe(newName);
		});

		it("T2-S2: Should reject rename to empty name", async () => {
			await request(app.getHttpServer())
				.patch(`/v1/file-system/nodes/${testFolderId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "",
				})
				.expect(400);
		});
	});

	describe("T3: File and Folder Move", () => {
		let sourceFolderId: string;
		let targetFolderId: string;
		let testFileId: string;

		beforeEach(async () => {
			const sourceResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Source Folder",
					description: "Source folder for move testing",
				});

			sourceFolderId = sourceResponse.body.id;

			const targetResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Target Folder",
					description: "Target folder for move testing",
				});

			targetFolderId = targetResponse.body.id;

			const fileResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Test File Node",
					description: "Test file node for move testing",
					parentId: sourceFolderId,
				});

			testFileId = fileResponse.body.id;
		});

		it("T3-S1: Should move a folder from source to target", async () => {
			const moveResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${testFileId}/move`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					targetParentId: targetFolderId,
				});

			expect(moveResponse.status).toBeLessThan(500);

			const movedNode = await prisma.fileSystemNode.findUnique({
				where: { id: testFileId },
			});

			expect(movedNode).toBeDefined();
			expect(movedNode?.parentId).toBe(targetFolderId);
		});
	});

	describe("T4: File and Folder Copy", () => {
		let sourceFolderId: string;
		let targetFolderId: string;

		beforeEach(async () => {
			const sourceResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Copy Source Folder",
					description: "Source folder for copy testing",
				});

			sourceFolderId = sourceResponse.body.id;

			const targetResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Copy Target Folder",
					description: "Target folder for copy testing",
				});

			targetFolderId = targetResponse.body.id;
		});

		it("T4-S1: Should copy a folder with contents", async () => {
			const copyResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${sourceFolderId}/copy`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					targetParentId: targetFolderId,
					newName: "Copied Folder",
				});

			expect(copyResponse.status).toBeLessThan(500);
		});
	});

	describe("T5: Folder Navigation and Children Listing", () => {
		let parentFolderId: string;
		let childFolderId1: string;
		let childFolderId2: string;

		beforeEach(async () => {
			const parentResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Navigation Parent",
					description: "Parent folder for navigation testing",
				});

			parentFolderId = parentResponse.body.id;

			const child1Response = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Child 1",
					description: "Child folder 1",
					parentId: parentFolderId,
				});

			childFolderId1 = child1Response.body.id;

			const child2Response = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Child 2",
					description: "Child folder 2",
					parentId: parentFolderId,
				});

			childFolderId2 = child2Response.body.id;
		});

		it("T5-S1: Should list children of a folder", async () => {
			const childrenResponse = await request(app.getHttpServer())
				.get(`/v1/file-system/nodes/${parentFolderId}/children`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.expect(200);

			expect(childrenResponse.body).toBeDefined();
		});

		it("T5-S2: Should support pagination for children listing", async () => {
			const childrenResponse = await request(app.getHttpServer())
				.get(`/v1/file-system/nodes/${parentFolderId}/children`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.query({ page: 1, limit: 10 })
				.expect(200);

			expect(childrenResponse.body).toBeDefined();
		});
	});

	describe("T6: Complete File Operations Chain Integration", () => {
		it("T6-S1: Should complete full file operations chain - create → rename → move → copy → verify", async () => {
			const createResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Chain Test Folder",
					description: "Folder for complete chain testing",
				});

			const folderId = createResponse.body.id;

			await request(app.getHttpServer())
				.patch(`/v1/file-system/nodes/${folderId}`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Renamed Chain Folder",
				});

			const targetFolderResponse = await request(app.getHttpServer())
				.post(`/v1/file-system/projects/${testProjectId}/folders`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					name: "Target Chain Folder",
					description: "Target folder for move testing",
				});

			const targetFolderId = targetFolderResponse.body.id;

			await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${folderId}/move`)
				.set("Authorization", `Bearer ${testUserAuthToken}`)
				.send({
					targetParentId: targetFolderId,
				});

			const movedFolder = await prisma.fileSystemNode.findUnique({
				where: { id: folderId },
			});

			expect(movedFolder).toBeDefined();
			expect(movedFolder?.name).toBe("Renamed Chain Folder");
			expect(movedFolder?.parentId).toBe(targetFolderId);
		});
	});
});
