///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 统一转换任务层集成测试（S8-3）
 *
 * 验证 `UnifiedConversionService.listTasks` 的 DB 访问过滤正确性——这是单测
 * mock 覆盖不了的核心 DB 交互：listTasks 按"当前用户可访问的节点"过滤
 * （project 归属 + 成员 + PERSONAL_SPACE 归属），须对真实 PG 验证跨用户隔离。
 */
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, FileStatus, NodeType } from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { initIntegrationApp } from "../../src/test/integration-app";
import { UnifiedConversionService } from "../../src/mxcad/conversion/conversion-task.service";

describe("Unified Conversion Task Layer Integration", () => {
	let app: INestApplication;
	let prisma: PrismaClient;
	let service: UnifiedConversionService;

	let userA: { id: string; email: string };
	let userB: { id: string; email: string };
	/** 用户 A 拥有的项目根节点（nodeType=PROJECT） */
	let projectP: string;
	/** 项目 P 下的文件节点（taskId + PROCESSING）—— 测 project 归属访问过滤 */
	let fileF: string;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = initIntegrationApp(moduleFixture.createNestApplication());
		await app.init();
		service = moduleFixture.get(UnifiedConversionService);

		prisma = new PrismaClient({
			adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
		});
		await prisma.$connect();

		const ts = Date.now();
		const emailA = `convtask-a-${ts}@example.com`;
		const emailB = `convtask-b-${ts}@example.com`;
		// username 有 @MaxLength(20)：`convtaska` + ts.slice(-8) = 17 字符
		const regA = await request(app.getHttpServer())
			.post("/v1/auth/register")
			.send({
				email: emailA,
				username: `convtaska${ts.toString().slice(-8)}`,
				password: "ConvTask@123456",
				nickname: "Conv Task User A",
			});
		expect(regA.status).toBe(201);
		expect(regA.body.data?.user).toBeTruthy();
		userA = { id: regA.body.data.user.id, email: emailA };

		const regB = await request(app.getHttpServer())
			.post("/v1/auth/register")
			.send({
				email: emailB,
				username: `convtaskb${ts.toString().slice(-8)}`,
				password: "ConvTask@123456",
				nickname: "Conv Task User B",
			});
		expect(regB.status).toBe(201);
		expect(regB.body.data?.user).toBeTruthy();
		userB = { id: regB.body.data.user.id, email: emailB };

		// 用户 A 拥有的项目根节点（nodeType=PROJECT）
		const projectPResult = await prisma.fileSystemNode.create({
			data: {
				name: "convtask-project",
				nodeType: NodeType.PROJECT,
				ownerId: userA.id,
			},
		});
		projectP = projectPResult.id;

		// 项目 P 下的文件节点（taskId + PROCESSING）：
		// 命中 listTasks 的 `{ project: accessibleProjectFilter }` 分支
		// —— 用户 A 是 P 的 owner 故可见；用户 B 非成员故不可见
		const fileFResult = await prisma.fileSystemNode.create({
			data: {
				name: "f-test.dwg",
				nodeType: NodeType.FILE,
				ownerId: userA.id,
				projectId: projectP,
				fileStatus: FileStatus.PROCESSING,
				taskId: "task-f-1",
			},
		});
		fileF = fileFResult.id;
	}, 90000);

	afterAll(async () => {
		// 防御式清理：beforeAll 部分失败时 projectP/fileF 可能未定义，按 owner email 收口
		const ownerEmails = [userA?.email, userB?.email].filter(
			(e): e is string => Boolean(e),
		);
		if (ownerEmails.length > 0) {
			await prisma.fileSystemNode.deleteMany({
				where: { owner: { email: { in: ownerEmails } } },
			});
			await prisma.user.deleteMany({
				where: { email: { in: ownerEmails } },
			});
		}
		await prisma.$disconnect();
		if (app) await app.close();
	}, 60000);

	it("listTasks 按 project 归属做跨用户访问过滤", async () => {
		// 用户 A 是项目 P 的 owner → 项目内文件 F 可见
		const resultA = await service.listTasks(userA.id);
		const idsA = resultA.tasks.map((t) => t.nodeId);
		expect(idsA).toContain(fileF);

		// 用户 B 非 P 成员 → 同一文件 F 不可见（project 归属过滤）
		const resultB = await service.listTasks(userB.id);
		const idsB = resultB.tasks.map((t) => t.nodeId);
		expect(idsB).not.toContain(fileF);
	}, 30000);
});
