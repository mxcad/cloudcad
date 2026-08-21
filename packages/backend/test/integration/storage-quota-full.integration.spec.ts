///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

// #289 storage-quota-full 配额边界集成测试
//
// 覆盖：
// 1. 个人存储配额打满 → 上传被拒（QuotaExceededException）
// 2. 项目配额打满 → 新增（上传）/ 复制 / 移动文件被拒
// 3. 项目数量上限（maxProjects）打满 → 创建项目被拒（HTTP + i18n 消息）
// 4. 删除文件释放配额后恢复可上传
// 5. 配额计算与 StorageUsageService 聚合一致（含外部参照、多节点嵌套）
//
// 配额设置：可编程式直接 DB 写入（专属测试 VIP 等级 level=99 的 configs +
// 用户 membership），不依赖人工种子数据；与 seed 的 registry 默认值无耦合。
//
// 上传路径说明：HTTP 上传端点（POST /v1/mxcad/files/uploadFiles）经 multer
// 默认内存存储，supertest 无法提供磁盘文件路径，配额检查链路走不到；
// 故上传路径在服务层（真实 AppModule DI 的 DrawingIngestService.ingest +
// 真实临时文件）验证 —— 与 HTTP 端点共用同一 checkQuota → assertByteQuota
// → RestrictionStrategy → StorageUsageService 链路。复制 / 移动 / 建项目
// 走完整 HTTP 端点（含 i18n 消息断言）。
//
// 运行前提：真实 PG（TEST_DATABASE_URL，缺省 5432/cloudcad_test；test-db.mjs
// 用 5433 起库）+ Redis（setup.ts 已 mock 为内存版）。本地无 Docker 时
// 无法运行，标注「需 Docker：node scripts/test-db.mjs run 或 CI」。

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { FileStatus, NodeType, PrismaClient } from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { initIntegrationApp } from "../../src/test/integration-app";
import { DrawingIngestService, type IngestTarget } from "../../src/mxcad/upload/drawing-ingest.service";
import { NodeMutationGuard } from "../../src/file-operations/node-mutation.guard";
import { QuotaExceededException } from "../../src/vip/errors/quota-exceeded.error";
import { QUOTA_KEYS } from "../../src/vip/quota-keys";
import { RestrictionEngine } from "../../src/vip/restriction-engine.service";
import { StorageUsageService } from "../../src/vip/storage-usage/storage-usage.service";

const MB = 1024 * 1024;
/** 专属测试 VIP 等级：不与 seed 的 VIP0-VIP3 冲突，避免污染共享配置 */
const TEST_TIER_LEVEL = 99;

interface QuotaConfigs {
	personalMB?: number;
	projectMB?: number;
	maxProjects?: number;
}

interface HttpErrorBody {
	code?: string;
	message?: string;
	restrictionKey?: string;
	current?: number;
	limit?: number;
	need?: number;
}

describe("Storage Quota Full → Rejection → Release → Recovery Integration (#289)", () => {
	let app: INestApplication;
	let prisma: PrismaClient;
	let ingestService: DrawingIngestService;
	let nodeMutationGuard: NodeMutationGuard;
	let restrictionEngine: RestrictionEngine;
	let storageUsageService: StorageUsageService;

	let tempRootDir: string;
	const registeredEmails: string[] = [];

	beforeAll(async () => {
		// 快速探测 PG 可达性：本地无 Docker 时给出明确提示而非超时
		// （#289 交付标准：真实运行需 `node scripts/test-db.mjs run` 或 CI）
		const probe = new PrismaClient({
			adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
		});
		let dbReachable = false;
		try {
			await probe.$queryRaw`SELECT 1`;
			dbReachable = true;
		} catch {
			// 不可达：走下方明确报错
		} finally {
			await probe.$disconnect().catch(() => undefined);
		}
		if (!dbReachable) {
			throw new Error(
				"集成测试需要真实 PostgreSQL（TEST_DATABASE_URL 不可达）：" +
					"本地请运行 node scripts/test-db.mjs run，或在 CI 运行"
			);
		}

		// 存储/上传路径指向临时目录，避免 ingest 落盘写入仓库目录
		tempRootDir = path.join(os.tmpdir(), `storage-quota-full-${Date.now()}`);
		fs.mkdirSync(path.join(tempRootDir, "filesData"), { recursive: true });
		fs.mkdirSync(path.join(tempRootDir, "uploads"), { recursive: true });
		process.env.FILES_DATA_PATH = path.join(tempRootDir, "filesData");
		process.env.MXCAD_UPLOAD_PATH = path.join(tempRootDir, "uploads");

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = initIntegrationApp(moduleFixture.createNestApplication());
		await app.init();

		prisma = new PrismaClient({
			adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
		});
		await prisma.$connect();

		ingestService = app.get(DrawingIngestService);
		nodeMutationGuard = app.get(NodeMutationGuard);
		restrictionEngine = app.get(RestrictionEngine);
		storageUsageService = app.get(StorageUsageService);
	}, 60000);

	afterAll(async () => {
		await cleanupTestData();
		await prisma?.$disconnect();
		await app?.close();
		try {
			fs.rmSync(tempRootDir, { recursive: true, force: true });
		} catch {
			// 忽略清理失败
		}
	}, 60000);

	/** 每步独立容错：DB 不可达（本地无 Docker）时清理失败不拖垮 afterAll */
	async function cleanupTestData() {
		if (!prisma) return;
		const guarded = (fn: () => Promise<unknown>) =>
			fn().catch(() => undefined);
		await guarded(() => prisma.refreshToken.deleteMany({}));
		if (registeredEmails.length > 0) {
			await guarded(() =>
				prisma.userMembership.deleteMany({
					where: { user: { email: { in: registeredEmails } } },
				})
			);
			await guarded(() =>
				prisma.projectMember.deleteMany({
					where: { user: { email: { in: registeredEmails } } },
				})
			);
			await guarded(() =>
				prisma.fileSystemNode.deleteMany({
					where: { owner: { email: { in: registeredEmails } } },
				})
			);
			await guarded(() =>
				prisma.user.deleteMany({
					where: { email: { in: registeredEmails } },
				})
			);
		}
		await guarded(() =>
			prisma.vipTier.deleteMany({ where: { level: TEST_TIER_LEVEL } })
		);
	}

	async function registerUser(prefix: string) {
		const email = `quota-${prefix}-${Date.now()}-${Math.floor(
			Math.random() * 10000
		)}@example.com`;
		registeredEmails.push(email);
		const res = await request(app.getHttpServer())
			.post("/v1/auth/register")
			.send({
				email,
				username: `quota${prefix}${Date.now().toString().slice(-6)}`,
				password: "Quota@123456",
				nickname: `Quota ${prefix}`,
			})
			.expect(201);
		return {
			id: res.body.data.user.id as string,
			token: res.body.data.accessToken as string,
			email,
		};
	}

	/**
	 * 配额配置唯一写入入口（#289 可编程式配额）：
	 * 专属测试等级 configs（tier configs 覆盖 registry 默认值）+ 用户 membership
	 * （expiresAt=null 视为永久有效，isActiveMembership 语义见 membership.service）。
	 */
	async function setQuotaForUser(userId: string, q: QuotaConfigs) {
		const configs = {
			[QUOTA_KEYS.PERSONAL_STORAGE]: q.personalMB ?? 99999,
			[QUOTA_KEYS.PROJECT_SIZE]: q.projectMB ?? 99999,
			[QUOTA_KEYS.MAX_PROJECTS]: q.maxProjects ?? 5,
		};
		await prisma.vipTier.upsert({
			where: { level: TEST_TIER_LEVEL },
			create: {
				level: TEST_TIER_LEVEL,
				name: "TEST_QUOTA_TIER",
				baseMonthlyPrice: 0,
				isActive: true,
				configs,
			},
			update: { configs },
		});
		await prisma.userMembership.upsert({
			where: { userId },
			create: { userId, tierLevel: TEST_TIER_LEVEL, expiresAt: null },
			update: { tierLevel: TEST_TIER_LEVEL, expiresAt: null },
		});
	}

	async function getPersonalSpace(userId: string) {
		const ps = await prisma.fileSystemNode.findFirst({
			where: { ownerId: userId, nodeType: NodeType.PERSONAL_SPACE },
		});
		expect(ps).toBeDefined();
		return ps!;
	}

	async function createProjectViaApi(token: string, name: string) {
		const res = await request(app.getHttpServer())
			.post("/v1/file-system/projects")
			.set("Authorization", `Bearer ${token}`)
			.send({ name, description: "quota integration test project" })
			.expect(201);
		return res.body.data.id as string;
	}

	/**
	 * 直接 DB 种子文件节点：COMPLETED 节点 size 必须是真实字节数
	 * （CONTEXT.md 领域不变量：配额增量计算与用量统计依赖此不变量）。
	 */
	async function seedFileNode(opts: {
		ownerId: string;
		parentId: string;
		projectId: string;
		name: string;
		size: number;
		fileStatus?: FileStatus;
		deletedAt?: Date;
	}) {
		return prisma.fileSystemNode.create({
			data: {
				name: opts.name,
				nodeType: NodeType.FILE,
				parentId: opts.parentId,
				projectId: opts.projectId,
				ownerId: opts.ownerId,
				size: opts.size,
				fileStatus: opts.fileStatus ?? FileStatus.COMPLETED,
				deletedAt: opts.deletedAt ?? null,
			},
		});
	}

	async function seedFolderNode(opts: {
		ownerId: string;
		parentId: string;
		projectId: string;
		name: string;
	}) {
		return prisma.fileSystemNode.create({
			data: {
				name: opts.name,
				nodeType: NodeType.FOLDER,
				parentId: opts.parentId,
				projectId: opts.projectId,
				ownerId: opts.ownerId,
			},
		});
	}

	/**
	 * 服务层上传尝试：真实临时文件（真实字节数）经真实 AppModule DI 的
	 * DrawingIngestService.ingest 走 checkQuota → assertByteQuota 配额链路。
	 */
	function uploadAttempt(
		ownerId: string,
		parentNodeId: string,
		hash: string,
		bytes: number
	) {
		const name = `quota-${hash}.txt`;
		const filePath = path.join(tempRootDir, "uploads", name);
		fs.writeFileSync(filePath, Buffer.alloc(bytes, 0x61));
		const target: IngestTarget = {
			userId: ownerId,
			parentNodeId,
			ownerId,
			conflictStrategy: "rename",
			isLibrary: false,
		};
		return ingestService.ingest(
			{ kind: "file", filePath, fileHash: hash, name, size: bytes },
			target
		);
	}

	/** 断言服务层抛出的 QuotaExceededException（403 + QUOTA_EXCEEDED + restrictionKey） */
	async function expectQuotaRejection(
		promise: Promise<unknown>,
		restrictionKey: string
	) {
		let caught: unknown;
		try {
			await promise;
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(QuotaExceededException);
		const details = (caught as QuotaExceededException).getResponse() as Record<
			string,
			unknown
		>;
		expect(details.code).toBe("QUOTA_EXCEEDED");
		expect(details.restrictionKey).toBe(restrictionKey);
		expect((caught as QuotaExceededException).getStatus()).toBe(403);
		return details;
	}

	/** 断言 HTTP 403 QUOTA_EXCEEDED 响应（含 i18n 消息与配额详情） */
	function expectQuotaExceededHttp(
		res: request.Response,
		restrictionKey: string
	) {
		expect(res.status).toBe(403);
		expect(res.body.code).toBe("QUOTA_EXCEEDED");
		expect(res.body.restrictionKey).toBe(restrictionKey);
		return res.body as HttpErrorBody;
	}

	describe("T1: 个人存储配额打满 → 上传被拒", () => {
		let user: Awaited<ReturnType<typeof registerUser>>;
		let personalSpaceId: string;

		beforeAll(async () => {
			user = await registerUser("t1");
			personalSpaceId = (await getPersonalSpace(user.id)).id;
			// 个人空间 2MB 上限；项目配额放很大避免干扰
			await setQuotaForUser(user.id, { personalMB: 2, projectMB: 99999 });
			// 已用 1MB（COMPLETED + 真实字节数）
			await seedFileNode({
				ownerId: user.id,
				parentId: personalSpaceId,
				projectId: personalSpaceId,
				name: "seeded-1mb.dwg",
				size: 1 * MB,
			});
		}, 30000);

		it("T1-S1: 已用 1MB / 上限 2MB，上传 1.5MB 被拒（QuotaExceededException + 详情）", async () => {
			const details = await expectQuotaRejection(
				uploadAttempt(user.id, personalSpaceId, "t1-full-upload", 1.5 * MB),
				QUOTA_KEYS.PERSONAL_STORAGE
			);
			// current = 1MB(已用) + 1.5MB(增量) = 2.5MB > limit 2MB
			expect(details.current).toBe(2.5 * MB);
			expect(details.limit).toBe(2 * MB);

			// 被拒不产生新节点
			const fileCount = await prisma.fileSystemNode.count({
				where: {
					projectId: personalSpaceId,
					nodeType: NodeType.FILE,
					deletedAt: null,
				},
			});
			expect(fileCount).toBe(1);
		});

		it("T1-S2: 恰好打满（current + increment === limit）放行", async () => {
			const result = await uploadAttempt(
				user.id,
				personalSpaceId,
				"t1-boundary",
				1 * MB
			);
			// 1MB(已用) + 1MB = 2MB = limit：配额检查不拒绝（后续落盘成败不影响配额语义）
			expect(result).toBeDefined();
		});

		it("T1-S3: 配额检查用到的聚合与 StorageUsageService 一致", async () => {
			const usage = await storageUsageService.usageSize({
				kind: "personal",
				userId: user.id,
			});
			const raw = await prisma.fileSystemNode.aggregate({
				where: {
					projectId: personalSpaceId,
					nodeType: NodeType.FILE,
					fileStatus: FileStatus.COMPLETED,
					deletedAt: null,
				},
				_sum: { size: true },
			});
			expect(usage).toBe(raw._sum.size ?? 0);
		});
	});

	describe("T2: 项目配额打满 → 新增/复制/移动文件被拒", () => {
		let user: Awaited<ReturnType<typeof registerUser>>;
		let personalSpaceId: string;
		let projectId: string;
		let sourceCopyId: string;
		let sourceMoveId: string;

		beforeAll(async () => {
			user = await registerUser("t2");
			personalSpaceId = (await getPersonalSpace(user.id)).id;
			// 项目 2MB 上限；个人空间放很大避免干扰
			await setQuotaForUser(user.id, { personalMB: 99999, projectMB: 2 });
			projectId = await createProjectViaApi(
				user.token,
				`Quota Project ${Date.now()}`
			);
			// 项目已用 1.5MB
			await seedFileNode({
				ownerId: user.id,
				parentId: projectId,
				projectId,
				name: "project-seeded-1.5mb.dwg",
				size: 1.5 * MB,
			});
			// 复制/移动源文件放个人空间（1MB 增量 → 1.5+1=2.5MB > 2MB）
			sourceCopyId = (
				await seedFileNode({
					ownerId: user.id,
					parentId: personalSpaceId,
					projectId: personalSpaceId,
					name: "copy-source-1mb.dwg",
					size: 1 * MB,
				})
			).id;
			sourceMoveId = (
				await seedFileNode({
					ownerId: user.id,
					parentId: personalSpaceId,
					projectId: personalSpaceId,
					name: "move-source-1mb.dwg",
					size: 1 * MB,
				})
			).id;
		}, 30000);

		it("T2-S1: 新增（上传）到项目被拒", async () => {
			const details = await expectQuotaRejection(
				uploadAttempt(user.id, projectId, "t2-upload", 1 * MB),
				QUOTA_KEYS.PROJECT_SIZE
			);
			expect(details.limit).toBe(2 * MB);
		});

		it("T2-S2: 复制文件进项目被拒（HTTP 403 + i18n 消息）", async () => {
			const res = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${sourceCopyId}/copy`)
				.set("Authorization", `Bearer ${user.token}`)
				.send({ targetParentId: projectId });

			const body = expectQuotaExceededHttp(res, QUOTA_KEYS.PROJECT_SIZE);
			expect(body.message).toContain("项目体积超出限额");

			// 复制被拒不产生新节点
			const fileCount = await prisma.fileSystemNode.count({
				where: { projectId, nodeType: NodeType.FILE, deletedAt: null },
			});
			expect(fileCount).toBe(1);
		});

		it("T2-S3: 移动文件进项目被拒（HTTP 403 + i18n 消息）", async () => {
			const res = await request(app.getHttpServer())
				.post(`/v1/file-system/nodes/${sourceMoveId}/move`)
				.set("Authorization", `Bearer ${user.token}`)
				.send({ targetParentId: projectId });

			const body = expectQuotaExceededHttp(res, QUOTA_KEYS.PROJECT_SIZE);
			expect(body.message).toContain("项目体积超出限额");

			// 移动被拒：源文件仍在个人空间
			const src = await prisma.fileSystemNode.findUnique({
				where: { id: sourceMoveId },
			});
			expect(src?.projectId).toBe(personalSpaceId);
			expect(src?.deletedAt).toBeNull();
		});
	});

	describe("T3: 项目数量上限（maxProjects）打满 → 创建项目被拒", () => {
		let user: Awaited<ReturnType<typeof registerUser>>;

		beforeAll(async () => {
			user = await registerUser("t3");
			// 上限 1 个项目
			await setQuotaForUser(user.id, { maxProjects: 1 });
		}, 30000);

		it("T3-S1: 创建第 1 个项目成功", async () => {
			const projectId = await createProjectViaApi(
				user.token,
				`Max Project ${Date.now()}`
			);
			expect(projectId).toBeDefined();
		});

		it("T3-S2: 创建第 2 个项目被拒（HTTP 403 + i18n 消息 + 配额详情）", async () => {
			const res = await request(app.getHttpServer())
				.post("/v1/file-system/projects")
				.set("Authorization", `Bearer ${user.token}`)
				.send({
					name: `Max Project Rejected ${Date.now()}`,
					description: "should be rejected",
				});

			const body = expectQuotaExceededHttp(res, QUOTA_KEYS.MAX_PROJECTS);
			expect(body.message).toContain("项目数量已达上限");
			expect(body.current).toBe(1);
			expect(body.limit).toBe(1);
			expect(body.need).toBe(1);
		});
	});

	describe("T4: 删除文件释放配额后恢复可上传", () => {
		let user: Awaited<ReturnType<typeof registerUser>>;
		let personalSpaceId: string;
		let seededFileId: string;

		beforeAll(async () => {
			user = await registerUser("t4");
			personalSpaceId = (await getPersonalSpace(user.id)).id;
			await setQuotaForUser(user.id, { personalMB: 2, projectMB: 99999 });
			// 已用 1.5MB（1.5+1=2.5MB > 2MB → 上传 1MB 会被拒）
			seededFileId = (
				await seedFileNode({
					ownerId: user.id,
					parentId: personalSpaceId,
					projectId: personalSpaceId,
					name: "t4-1.5mb.dwg",
					size: 1.5 * MB,
				})
			).id;
		}, 30000);

		it("T4-S1: 打满时上传 1MB 被拒", async () => {
			await expectQuotaRejection(
				uploadAttempt(user.id, personalSpaceId, "t4-before-delete", 1 * MB),
				QUOTA_KEYS.PERSONAL_STORAGE
			);
		});

		it("T4-S2: HTTP 删除文件（进回收站）", async () => {
			const res = await request(app.getHttpServer())
				.delete(`/v1/file-system/nodes/${seededFileId}`)
				.set("Authorization", `Bearer ${user.token}`)
				.expect(200);
			expect(res.body).toBeDefined();

			const deleted = await prisma.fileSystemNode.findUnique({
				where: { id: seededFileId },
			});
			expect(deleted?.deletedAt).not.toBeNull();
			expect(deleted?.fileStatus).toBe(FileStatus.DELETED);
		});

		it("T4-S3: 删除后配额释放，个人聚合归零", async () => {
			const usage = await storageUsageService.usageSize({
				kind: "personal",
				userId: user.id,
			});
			expect(usage).toBe(0);
		});

		it("T4-S4: 恢复可上传（不再抛 QuotaExceededException）", async () => {
			const result = await uploadAttempt(
				user.id,
				personalSpaceId,
				"t4-after-delete",
				1 * MB
			);
			expect(result).toBeDefined();

			// 守卫层配额检查同样放行（与上传路径同一断言入口）
			await expect(
				nodeMutationGuard.assertByteQuota(
					{ node: { id: personalSpaceId }, incrementBytes: 1 * MB },
					user.id
				)
			).resolves.toBeUndefined();
		});
	});

	describe("T5: 配额计算与 StorageUsageService 聚合一致（含外部参照、多节点）", () => {
		let user: Awaited<ReturnType<typeof registerUser>>;
		let personalSpaceId: string;
		let projectId: string;
		let folderAId: string;
		let folderPId: string;

		beforeAll(async () => {
			user = await registerUser("t5");
			personalSpaceId = (await getPersonalSpace(user.id)).id;
			projectId = await createProjectViaApi(
				user.token,
				`Agg Project ${Date.now()}`
			);
			// 配额放很大，只验证聚合口径
			await setQuotaForUser(user.id, {
				personalMB: 99999,
				projectMB: 99999,
				maxProjects: 5,
			});

			// 个人空间：多级嵌套 + 外部参照（图片）+ 已删除 + 非终态（size=0 符合领域不变量）
			folderAId = (
				await seedFolderNode({
					ownerId: user.id,
					parentId: personalSpaceId,
					projectId: personalSpaceId,
					name: "folderA",
				})
			).id;
			const subFolderBId = (
				await seedFolderNode({
					ownerId: user.id,
					parentId: folderAId,
					projectId: personalSpaceId,
					name: "subfolderB",
				})
			).id;
			await seedFileNode({
				ownerId: user.id,
				parentId: subFolderBId,
				projectId: personalSpaceId,
				name: "nested-0.5mb.dwg",
				size: 0.5 * MB,
			});
			await seedFileNode({
				ownerId: user.id,
				parentId: folderAId,
				projectId: personalSpaceId,
				name: "main-1mb.dwg",
				size: 1 * MB,
			});
			// 外部参照文件：普通 FILE 节点挂在主图所在目录下
			await seedFileNode({
				ownerId: user.id,
				parentId: folderAId,
				projectId: personalSpaceId,
				name: "extref-image.jpg",
				size: 0.25 * MB,
			});
			await seedFileNode({
				ownerId: user.id,
				parentId: personalSpaceId,
				projectId: personalSpaceId,
				name: "deleted-0.75mb.dwg",
				size: 0.75 * MB,
				fileStatus: FileStatus.DELETED,
				deletedAt: new Date(),
			});
			await seedFileNode({
				ownerId: user.id,
				parentId: personalSpaceId,
				projectId: personalSpaceId,
				name: "uploading-0.dwg",
				size: 0,
				fileStatus: FileStatus.UPLOADING,
			});

			// 项目：文件夹嵌套 + 主图/外部参照 + 已删除
			folderPId = (
				await seedFolderNode({
					ownerId: user.id,
					parentId: projectId,
					projectId,
					name: "folderP",
				})
			).id;
			await seedFileNode({
				ownerId: user.id,
				parentId: folderPId,
				projectId,
				name: "main-2mb.dwg",
				size: 2 * MB,
			});
			// 外部参照（dwg 引用）：普通 FILE 节点
			await seedFileNode({
				ownerId: user.id,
				parentId: folderPId,
				projectId,
				name: "extref-0.5mb.dwg",
				size: 0.5 * MB,
			});
			await seedFileNode({
				ownerId: user.id,
				parentId: projectId,
				projectId,
				name: "deleted-0.75mb.dwg",
				size: 0.75 * MB,
				fileStatus: FileStatus.DELETED,
				deletedAt: new Date(),
			});
		}, 30000);

		it("T5-S1: personal 聚合 = 嵌套 + 外部参照（0.5+1+0.25MB），排除已删除/非终态", async () => {
			const usage = await storageUsageService.usageSize({
				kind: "personal",
				userId: user.id,
			});
			expect(usage).toBe((0.5 + 1 + 0.25) * MB);
		});

		it("T5-S2: project 聚合 = 项目全部 COMPLETED 文件（含文件夹嵌套，2+0.5MB）", async () => {
			const usage = await storageUsageService.usageSize({
				kind: "project",
				projectId,
			});
			expect(usage).toBe((2 + 0.5) * MB);
		});

		it("T5-S3: subtree 聚合 = 目录子树（folderA：0.5+1+0.25MB / folderP：2.5MB）", async () => {
			const folderAUsage = await storageUsageService.usageSize({
				kind: "subtree",
				nodeId: folderAId,
				status: "completed",
			});
			expect(folderAUsage).toBe((0.5 + 1 + 0.25) * MB);

			const folderPUsage = await storageUsageService.usageSize({
				kind: "subtree",
				nodeId: folderPId,
				status: "completed",
			});
			expect(folderPUsage).toBe((2 + 0.5) * MB);
		});

		it("T5-S4: owned 聚合 = 全部归属文件（不含已删除，含非终态 0 字节）", async () => {
			const usage = await storageUsageService.usageSize({
				kind: "owned",
				userId: user.id,
			});
			expect(usage).toBe((0.5 + 1 + 0.25 + 2 + 0.5) * MB);
		});

		it("T5-S5: 策略 current 与聚合一致 —— 恰好打满放行、超 1 字节拒绝", async () => {
			const limitBytes = 99999 * MB;
			const personalCurrent = await storageUsageService.usageSize({
				kind: "personal",
				userId: user.id,
			});
			expect(personalCurrent).toBe(1.75 * MB);

			// 恰好打满（current + increment === limit）→ 放行
			await expect(
				restrictionEngine.checkQuota(user.id, {
					projectId: personalSpaceId,
					incrementBytes: limitBytes - personalCurrent,
					strategyKeys: [QUOTA_KEYS.PERSONAL_STORAGE],
				})
			).resolves.toBeUndefined();

			// 超 1 字节 → 拒绝，且 current/limit 与聚合一致
			const details = await expectQuotaRejection(
				restrictionEngine.checkQuota(user.id, {
					projectId: personalSpaceId,
					incrementBytes: limitBytes - personalCurrent + 1,
					strategyKeys: [QUOTA_KEYS.PERSONAL_STORAGE],
				}),
				QUOTA_KEYS.PERSONAL_STORAGE
			);
			expect(details.current).toBe(limitBytes + 1);
			expect(details.limit).toBe(limitBytes);
			expect(details.configLimit).toBe(99999);
		});
	});
});
