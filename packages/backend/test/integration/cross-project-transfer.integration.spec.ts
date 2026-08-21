///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as fs from "fs";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, NodeType } from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { initIntegrationApp } from "../../src/test/integration-app";

/**
 * 跨项目转移 6 域模式矩阵集成测试：
 * 出向（本项目文件 → 其他项目/个人空间/公共库）× 入向（其他项目/个人空间/公共库 → 本项目）
 * 默认值：transferOutToProject=ALL、transferOutToPersonalSpace=NONE（防私有化）、
 * transferOutToLibrary=COPY_ONLY、三个入向=ALL。
 * 库域场景需 LIBRARY_*_MANAGE 系统权限（注册用户无），由单测矩阵覆盖，此处不重复。
 */
describe("Cross-Project Transfer Matrix Integration", () => {
	let app: INestApplication;
	let prisma: PrismaClient;

	let userA: { id: string; email: string; token: string };
	let userB: { id: string; email: string; token: string };
	let userC: { id: string; email: string; token: string };
	let projectAId: string;
	let projectA2Id: string;
	let projectBId: string;
	let fileAId: string;

	const emailSuffix = Date.now();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = initIntegrationApp(moduleFixture.createNestApplication());
		await app.init();

		prisma = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: process.env.DATABASE_URL,
			}),
		});
		await prisma.$connect();

		await cleanupTestData();
		await setupUsersAndProjects();
	}, 60000);

	afterAll(async () => {
		await cleanupTestData();
		await prisma.$disconnect();
		await app.close();
	}, 60000);

	async function cleanupTestData() {
		const emails = [userA?.email, userB?.email, userC?.email].filter(
			Boolean
		) as string[];
		await prisma.projectMember.deleteMany({
			where: { user: { email: { in: emails } } },
		});
		await prisma.fileSystemNode.deleteMany({
			where: { owner: { email: { in: emails } } },
		});
		await prisma.refreshToken.deleteMany({});
		await prisma.user.deleteMany({
			where: { email: { in: emails } },
		});
	}

	async function registerUser(tag: string) {
		const email = `xfer-${tag}-${emailSuffix}@example.com`;
		const res = await request(app.getHttpServer())
			.post("/v1/auth/register")
			.send({
				email,
				username: `xfer${tag}${emailSuffix.toString().slice(-6)}`,
				password: "Xfer@123456",
				nickname: `Transfer ${tag}`,
			});
		expect(res.status).toBe(201);
		return {
			id: res.body.data.user.id as string,
			email,
			token: res.body.data.accessToken as string,
		};
	}

	async function createProject(token: string, name: string) {
		const res = await request(app.getHttpServer())
			.post("/v1/file-system/projects")
			.set("Authorization", `Bearer ${token}`)
			.send({ name, description: "" });
		expect(res.status).toBe(201);
		return res.body.data.id as string;
	}

	/** 直插 FILE 节点（path=null 无物理文件，copy 跳过物理复制；move 不碰物理） */
	async function createFileNode(projectId: string, ownerId: string, name: string) {
		return prisma.fileSystemNode.create({
			data: {
				name,
				nodeType: NodeType.FILE,
				size: 1024,
				parentId: projectId,
				projectId,
				ownerId,
			},
		});
	}

	async function getPersonalSpaceId(token: string) {
		const res = await request(app.getHttpServer())
			.get("/v1/file-system/personal-space")
			.set("Authorization", `Bearer ${token}`);
		expect(res.status).toBe(200);
		return res.body.data.id as string;
	}

	async function copyNode(token: string, nodeId: string, targetParentId: string) {
		return request(app.getHttpServer())
			.post(`/v1/file-system/nodes/${nodeId}/copy`)
			.set("Authorization", `Bearer ${token}`)
			.send({ targetParentId });
	}

	async function moveNode(token: string, nodeId: string, targetParentId: string) {
		return request(app.getHttpServer())
			.post(`/v1/file-system/nodes/${nodeId}/move`)
			.set("Authorization", `Bearer ${token}`)
			.send({ targetParentId });
	}

	async function updateTransferSettings(
		token: string,
		projectId: string,
		settings: Record<string, string>
	) {
		return request(app.getHttpServer())
			.put(`/v1/file-system/projects/${projectId}/transfer-settings`)
			.set("Authorization", `Bearer ${token}`)
			.send(settings);
	}

	async function setupUsersAndProjects() {
		userA = await registerUser("a");
		userB = await registerUser("b");
		userC = await registerUser("c");

		projectAId = await createProject(userA.token, "Transfer Project A");
		projectA2Id = await createProject(userA.token, "Transfer Project A2");
		projectBId = await createProject(userB.token, "Transfer Project B");

		// 项目 A 内建文件
		const fileA = await createFileNode(projectAId, userA.id, "a.dwg");
		fileAId = fileA.id;

		// userC 加入项目 A（默认 MEMBER 角色，无 PROJECT_TRANSFER_MANAGE）
		const rolesRes = await request(app.getHttpServer())
			.get(`/v1/roles/project-roles/project/${projectAId}`)
			.set("Authorization", `Bearer ${userA.token}`);
		expect(rolesRes.status).toBe(200);
		const memberRole = (rolesRes.body.data as { id: string; name: string }[]).find(
			(r) => r.name === "PROJECT_MEMBER"
		);
		expect(memberRole).toBeDefined();
		const addMember = await request(app.getHttpServer())
			.post(`/v1/file-system/projects/${projectAId}/members`)
			.set("Authorization", `Bearer ${userA.token}`)
			.send({ userId: userC.id, projectRoleId: memberRole!.id });
		expect(addMember.status).toBe(201);
	}

	it("默认出向 ALL + 入向 ALL：跨项目复制成功（owner 自己的两个项目）", async () => {
		const res = await copyNode(userA.token, fileAId, projectA2Id);
		expect(res.status).toBe(201);
		const copied = await prisma.fileSystemNode.findFirst({
			where: { parentId: projectA2Id, name: "a.dwg" },
		});
		expect(copied).not.toBeNull();
		expect(copied?.projectId).toBe(projectA2Id);
	});

	it("非目标项目成员：复制到他人项目被拒（目标 FILE_CREATE 校验）", async () => {
		const res = await copyNode(userA.token, fileAId, projectBId);
		expect(res.status).toBe(403);
	});

	it("出向→个人空间默认 NONE：复制到本人个人空间被拒（防图纸私有化）", async () => {
		const spaceId = await getPersonalSpaceId(userA.token);
		const res = await copyNode(userA.token, fileAId, spaceId);
		expect(res.status).toBe(403);
	});

	it("更新 transferOutToPersonalSpace=ALL 后：复制到个人空间成功", async () => {
		const spaceId = await getPersonalSpaceId(userA.token);
		const upd = await updateTransferSettings(userA.token, projectAId, {
			transferOutToPersonalSpace: "ALL",
		});
		expect(upd.status).toBe(200);

		const res = await copyNode(userA.token, fileAId, spaceId);
		expect(res.status).toBe(201);
	});

	it("transferOutToProject=NONE：跨项目复制被拒（403）", async () => {
		await updateTransferSettings(userA.token, projectAId, {
			transferOutToProject: "NONE",
		});
		const res = await copyNode(userA.token, fileAId, projectA2Id);
		expect(res.status).toBe(403);
	});

	it("transferOutToProject=COPY_ONLY：复制放行、移动被拒", async () => {
		await updateTransferSettings(userA.token, projectAId, {
			transferOutToProject: "COPY_ONLY",
		});
		const copyRes = await copyNode(userA.token, fileAId, projectA2Id);
		expect(copyRes.status).toBe(201);
		const moveRes = await moveNode(userA.token, fileAId, projectA2Id);
		expect(moveRes.status).toBe(403);
	});

	it("入向 transferInFromProject=NONE：目标项目拒绝接收（即使源出向 ALL）", async () => {
		// 源项目 A 出向恢复 ALL；目标改为 A2（owner 自身，目标权限通过）
		await updateTransferSettings(userA.token, projectAId, {
			transferOutToProject: "ALL",
		});
		await updateTransferSettings(userA.token, projectA2Id, {
			transferInFromProject: "NONE",
		});
		const res = await copyNode(userA.token, fileAId, projectA2Id);
		expect(res.status).toBe(403);
		await updateTransferSettings(userA.token, projectA2Id, {
			transferInFromProject: "ALL",
		});
	});

	it("同项目内移动不受矩阵约束", async () => {
		// 项目 A 内建子文件夹 → 把 fileA 移入
		const folderRes = await request(app.getHttpServer())
			.post(`/v1/file-system/nodes/${projectAId}/folders`)
			.set("Authorization", `Bearer ${userA.token}`)
			.send({ name: "sub" });
		expect(folderRes.status).toBe(201);
		const folderId = folderRes.body.data.id as string;

		// 项目 A 出向仍为 COPY_ONLY，但同根内 move 不受影响
		const moveRes = await moveNode(userA.token, fileAId, folderId);
		expect(moveRes.status).toBe(201);
	});

	it("无 PROJECT_TRANSFER_MANAGE 的成员：更新设置被拒（403）", async () => {
		const res = await updateTransferSettings(userC.token, projectAId, {
			transferOutToPersonalSpace: "ALL",
		});
		expect(res.status).toBe(403);
	});
});
