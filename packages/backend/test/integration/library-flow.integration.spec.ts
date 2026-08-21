///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
//
// Library Flow Integration — 图库浏览/引用/权限/配额/悬挂引用链路
//
// 覆盖（issue #288）：
//   T1 图库目录浏览/搜索（Public 读，无需登录）
//   T2 从图库引用图纸到项目（跨项目复制 → fileHash 引用关系落库）
//   T3 引用权限：无 LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE 用户不可写
//   T4 配额：库上下文跳过字节配额；引用落项目后占用项目用量；删除回收
//   T5 悬挂引用：库源文件删除/移动后，项目内引用节点不受影响（fileHash 引用保护）
//
// 依赖：真实 PG（TEST_DATABASE_URL）+ mock Redis（src/test/setup.ts 内存实现）。
// 运行：node scripts/test-db.mjs run（需要 Docker daemon；CI 直接跑 pnpm test:integration）

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  PrismaClient,
  NodeType,
  FileStatus,
} from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import * as fs from "fs";
import * as path from "path";
import { AppModule } from "../../src/app.module";
import { initIntegrationApp } from "../../src/test/integration-app";

const PROJECT_SIZE_QUOTA_KEY = "quota.project_size_mb";
const MB = 1024 * 1024;

interface TestUser {
  id: string;
  email: string;
  token: string;
}

describe("Library Flow Integration - Browse/Reference/Permission/Quota/Dangling-Ref", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let regularUser: TestUser;
  let adminUser: TestUser;
  let projectId: string;
  let secondProjectId: string;
  let drawingLibId: string;
  let blockLibId: string;
  let tempDir: string;

  const suffix = Date.now();
  const createdNodeIds: string[] = [];
  let vip0OriginalConfigs: unknown = null;

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

    tempDir = path.join(process.cwd(), `temp-test-library-${suffix}`);
    fs.mkdirSync(tempDir, { recursive: true });

    regularUser = await registerUser("regular");
    adminUser = await registerUser("admin");
    await grantSystemRole(adminUser.id, "ADMIN");

    const projectRes = await request(app.getHttpServer())
      .post("/v1/file-system/projects")
      .set("Authorization", `Bearer ${regularUser.token}`)
      .send({
        name: `Library Flow Project ${suffix}`,
        description: "Library flow integration test",
      })
      .expect(201);
    projectId = projectRes.body.data.id;
    createdNodeIds.push(projectId);

    const secondProjectRes = await request(app.getHttpServer())
      .post("/v1/file-system/projects")
      .set("Authorization", `Bearer ${regularUser.token}`)
      .send({
        name: `Library Flow Project 2 ${suffix}`,
        description: "Second project for cross-project reference",
      })
      .expect(201);
    secondProjectId = secondProjectRes.body.data.id;
    createdNodeIds.push(secondProjectId);

    // 图库根节点幂等创建（初始化服务可能已在启动时创建，owner 为初始管理员）
    drawingLibId = await ensureLibraryRoot("drawing", adminUser.id);
    blockLibId = await ensureLibraryRoot("block", adminUser.id);

    const vip0 = await prisma.vipTier.findUnique({ where: { level: 0 } });
    vip0OriginalConfigs = vip0?.configs ?? null;
  }, 60000);

  afterAll(async () => {
    // 恢复 VIP0 配额配置（T4 会临时调小 project_size_mb）
    if (vip0OriginalConfigs !== null) {
      await prisma.vipTier
        .update({
          where: { level: 0 },
          data: { configs: vip0OriginalConfigs as object },
        })
        .catch(() => undefined);
    }

    await cleanupTestData();
    await prisma.$disconnect();

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}

    await app.close();
  }, 60000);

  // ============ helpers ============

  async function registerUser(prefix: string): Promise<TestUser> {
    const email = `library-${prefix}-${suffix}@example.com`;
    const response = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({
        email,
        username: `lib${prefix}${suffix.toString().slice(-8)}`,
        password: "Library@123456",
        nickname: `Library ${prefix} user`,
      })
      .expect(201);
    return {
      id: response.body.data.user.id,
      email,
      token: response.body.data.accessToken,
    };
  }

  /** 把用户切换到指定系统角色（注册用户默认 USER，无库管理权限） */
  async function grantSystemRole(userId: string, roleName: string) {
    const role = await prisma.role.findFirst({
      where: { name: roleName, isSystem: true },
      orderBy: { level: "desc" },
    });
    if (!role) {
      throw new Error(`system role not found: ${roleName}`);
    }
    await prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id },
    });
  }

  /** 幂等确保库根存在（app 初始化可能已创建），返回库根 id */
  async function ensureLibraryRoot(
    type: "drawing" | "block",
    ownerId: string
  ): Promise<string> {
    const nodeType =
      type === "drawing" ? NodeType.LIBRARY_DRAWING : NodeType.LIBRARY_BLOCK;
    const existing = await prisma.fileSystemNode.findFirst({
      where: { nodeType, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;
    const root = await prisma.fileSystemNode.create({
      data: {
        name: type === "drawing" ? "公共图纸库" : "公共图块库",
        description: "integration test library root",
        nodeType,
        projectStatus: "ACTIVE",
        ownerId,
      },
    });
    createdNodeIds.push(root.id);
    return root.id;
  }

  /** 图库内创建文件夹（走 API：LIBRARY_DRAWING_MANAGE 权限 + 目录落库） */
  async function createLibraryFolder(parentId: string, name: string) {
    const response = await request(app.getHttpServer())
      .post("/v1/library/drawing/folders")
      .set("Authorization", `Bearer ${adminUser.token}`)
      .send({ parentId, name })
      .expect(201);
    const id = response.body.data.id;
    createdNodeIds.push(id);
    return id;
  }

  /** 图库内直插文件节点（避免每用例走 multipart，浏览/引用/配额链路聚焦 DB 语义） */
  async function insertLibraryFile(
    parentId: string,
    name: string,
    options: { size?: number; fileHash?: string } = {}
  ) {
    const node = await prisma.fileSystemNode.create({
      data: {
        name,
        nodeType: NodeType.FILE,
        parentId,
        ownerId: adminUser.id,
        size: options.size ?? 1024,
        fileHash: options.fileHash ?? `hash-${name}-${suffix}`,
        fileStatus: FileStatus.COMPLETED,
        extension: ".mxweb",
      },
    });
    createdNodeIds.push(node.id);
    return node;
  }

  /** 管理员把图库文件复制到目标（跨项目引用入口） */
  async function copyLibraryNodeTo(nodeId: string, targetParentId: string) {
    const response = await request(app.getHttpServer())
      .post(`/v1/library/drawing/nodes/${nodeId}/copy`)
      .set("Authorization", `Bearer ${adminUser.token}`)
      .send({ targetParentId })
      .expect(201);
    const id = response.body.data.id;
    createdNodeIds.push(id);
    return id;
  }

  /** 项目字节用量（与 StorageUsageService.usageSize(kind:'project') 同语义） */
  async function projectUsage(pid: string): Promise<number> {
    const result = await prisma.fileSystemNode.aggregate({
      where: {
        projectId: pid,
        nodeType: NodeType.FILE,
        fileStatus: FileStatus.COMPLETED,
        deletedAt: null,
      },
      _sum: { size: true },
    });
    return result._sum.size ?? 0;
  }

  /** 临时把 project_size_mb 配额调成指定值（VIP0 覆盖 registry 默认值） */
  async function setProjectSizeQuota(mb: number) {
    const vip0 = await prisma.vipTier.findUnique({ where: { level: 0 } });
    if (!vip0) throw new Error("VIP0 tier not found");
    const configs = (vip0.configs ?? {}) as Record<string, unknown>;
    await prisma.vipTier.update({
      where: { level: 0 },
      data: { configs: { ...configs, [PROJECT_SIZE_QUOTA_KEY]: mb } },
    });
  }

  async function cleanupTestData() {
    // 删除本 spec 创建的节点（含项目；projectMember 随 FK 级联）
    if (createdNodeIds.length > 0) {
      await prisma.projectMember.deleteMany({
        where: { projectId: { in: createdNodeIds } },
      });
      await prisma.fileSystemNode.deleteMany({
        where: { id: { in: createdNodeIds } },
      });
    }
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { in: [regularUser.email, adminUser.email] } },
    });
  }

  // ============ T1 图库目录浏览 / 搜索 ============

  describe("T1: 图库目录浏览与搜索（Public 读）", () => {
    let folderId: string;
    let searchFileId: string;
    let plainFileId: string;

    beforeAll(async () => {
      folderId = await createLibraryFolder(drawingLibId, `T1 目录 ${suffix}`);
      const searchFile = await insertLibraryFile(drawingLibId, `t1-search-target-${suffix}.mxweb`, {
        size: 2048,
        fileHash: "t1-hash-search",
      });
      searchFileId = searchFile.id;
      const plainFile = await insertLibraryFile(drawingLibId, `t1-other-${suffix}.mxweb`, {
        size: 1024,
        fileHash: "t1-hash-other",
      });
      plainFileId = plainFile.id;
    });

    it("T1-S1: 无 token 获取图纸库根（nodeType=LIBRARY_DRAWING，公开读）", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/library/drawing")
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(drawingLibId);
      expect(response.body.data.nodeType).toBe("LIBRARY_DRAWING");
    });

    it("T1-S2: children 列出库根下目录与文件（公开读）", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/library/drawing/children/${drawingLibId}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      const nodeIds = response.body.data.nodes.map(
        (n: { id: string }) => n.id
      );
      expect(nodeIds).toContain(folderId);
      expect(nodeIds).toContain(searchFileId);
      expect(nodeIds).toContain(plainFileId);
    });

    it("T1-S3: all-files 递归搜索命中目标文件、排除无关文件", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/library/drawing/all-files/${drawingLibId}`)
        .query({ search: `t1-search-target-${suffix}` })
        .expect(200);

      const names = response.body.data.nodes.map(
        (n: { name: string }) => n.name
      );
      expect(names).toContain(`t1-search-target-${suffix}.mxweb`);
      expect(names).not.toContain(`t1-other-${suffix}.mxweb`);
    });

    it("T1-S4: 分类树接口返回 200", async () => {
      await request(app.getHttpServer())
        .get("/v1/library/drawing/categories")
        .expect(200);
    });

    it("T1-S5: 节点详情返回文件元信息", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/library/drawing/nodes/${searchFileId}`)
        .expect(200);

      expect(response.body.data.id).toBe(searchFileId);
      expect(response.body.data.nodeType).toBe("FILE");
    });

    it("T1-S6: 图块库根可公开读取（nodeType=LIBRARY_BLOCK）", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/library/block")
        .expect(200);

      expect(response.body.data.nodeType).toBe("LIBRARY_BLOCK");
    });
  });

  // ============ T2 引用图纸到项目（跨项目） ============

  describe("T2: 从图库引用图纸到项目（复制 → fileHash 引用关系落库）", () => {
    let libFileId: string;
    let refNodeId: string;

    beforeAll(async () => {
      const libFile = await insertLibraryFile(drawingLibId, `t2-lib-file-${suffix}.mxweb`, {
        size: 2 * MB,
        fileHash: "t2-hash-reference",
      });
      libFileId = libFile.id;
    });

    it("T2-S1: 管理员把图库文件复制到项目成功（201）", async () => {
      refNodeId = await copyLibraryNodeTo(libFileId, projectId);
      expect(refNodeId).toBeTruthy();
    });

    it("T2-S2: 引用关系落库——新节点归属项目且 fileHash 与库源一致", async () => {
      const ref = await prisma.fileSystemNode.findUnique({
        where: { id: refNodeId },
      });
      const source = await prisma.fileSystemNode.findUnique({
        where: { id: libFileId },
      });

      expect(ref).toBeDefined();
      expect(ref?.nodeType).toBe(NodeType.FILE);
      expect(ref?.parentId).toBe(projectId);
      expect(ref?.projectId).toBe(projectId);
      expect(ref?.fileHash).toBe(source?.fileHash);
      expect(ref?.size).toBe(source?.size);
    });

    it("T2-S3: 项目侧 children 可浏览到引用的图纸", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/nodes/${projectId}/children`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .expect(200);

      const nodeIds = response.body.data.nodes.map(
        (n: { id: string }) => n.id
      );
      expect(nodeIds).toContain(refNodeId);
    });

    it("T2-S4: 跨项目二次引用——两个项目各自落库且共享同一 fileHash", async () => {
      const secondRefId = await copyLibraryNodeTo(libFileId, secondProjectId);
      const secondRef = await prisma.fileSystemNode.findUnique({
        where: { id: secondRefId },
      });
      const source = await prisma.fileSystemNode.findUnique({
        where: { id: libFileId },
      });

      expect(secondRef?.projectId).toBe(secondProjectId);
      expect(secondRef?.fileHash).toBe(source?.fileHash);
      expect(secondRefId).not.toBe(refNodeId);
    });
  });

  // ============ T3 引用权限 ============

  describe("T3: 引用权限——无 LIBRARY_DRAWING_MANAGE 用户不可写", () => {
    let libFileId: string;

    beforeAll(async () => {
      const libFile = await insertLibraryFile(drawingLibId, `t3-lib-file-${suffix}.mxweb`, {
        size: 2048,
        fileHash: "t3-hash-permission",
      });
      libFileId = libFile.id;
    });

    it("T3-S1: 无 token 调用 save-as 被拒（401）", async () => {
      const anonPath = path.join(tempDir, "t3-anonymous.mxweb");
      fs.writeFileSync(anonPath, Buffer.alloc(1024));

      await request(app.getHttpServer())
        .post("/v1/library/drawing/save-as")
        .field("targetParentId", drawingLibId)
        .field("fileName", "t3-anonymous")
        .attach("file", anonPath)
        .expect(401);
    });

    it("T3-S2: 无 token 删除库节点被拒（401）", async () => {
      await request(app.getHttpServer())
        .delete(`/v1/library/drawing/nodes/${libFileId}`)
        .expect(401);
    });

    it("T3-S3: 普通用户 save-as 被拒（403）", async () => {
      const regularPath = path.join(tempDir, "t3-regular.mxweb");
      fs.writeFileSync(regularPath, Buffer.alloc(1024));

      await request(app.getHttpServer())
        .post("/v1/library/drawing/save-as")
        .set("Authorization", `Bearer ${regularUser.token}`)
        .field("targetParentId", drawingLibId)
        .field("fileName", "t3-regular")
        .attach("file", regularPath)
        .expect(403);
    });

    it("T3-S4: 普通用户创建库目录被拒（403）", async () => {
      await request(app.getHttpServer())
        .post("/v1/library/drawing/folders")
        .set("Authorization", `Bearer ${regularUser.token}`)
        .send({ parentId: drawingLibId, name: "forbidden folder" })
        .expect(403);
    });

    it("T3-S5: 普通用户复制库文件到自己的项目也被拒（403，controller 层系统权限拦截）", async () => {
      await request(app.getHttpServer())
        .post(`/v1/library/drawing/nodes/${libFileId}/copy`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .send({ targetParentId: projectId })
        .expect(403);
    });

    it("T3-S6: 普通用户删除库节点被拒（403）", async () => {
      await request(app.getHttpServer())
        .delete(`/v1/library/drawing/nodes/${libFileId}`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .expect(403);
    });

    it("T3-S7: 普通用户读图库仍允许（公开读不受写权限限制）", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/library/drawing/children/${drawingLibId}`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it("T3-S8: 普通用户写图块库被拒（403，LIBRARY_BLOCK_MANAGE 分离）", async () => {
      await request(app.getHttpServer())
        .post("/v1/library/block/folders")
        .set("Authorization", `Bearer ${regularUser.token}`)
        .send({ parentId: blockLibId, name: "forbidden block folder" })
        .expect(403);
    });

    it("T3-S9: 管理员 save-as 成功并落库", async () => {
      const saveAsPath = path.join(tempDir, "t3-admin-saved.mxweb");
      fs.writeFileSync(saveAsPath, Buffer.alloc(4096));

      const response = await request(app.getHttpServer())
        .post("/v1/library/drawing/save-as")
        .set("Authorization", `Bearer ${adminUser.token}`)
        .field("targetParentId", drawingLibId)
        .field("fileName", `t3-admin-saved-${suffix}`)
        .attach("file", saveAsPath)
        .expect(200);

      const nodeId = response.body.data.nodeId;
      createdNodeIds.push(nodeId);
      const node = await prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });
      expect(node?.nodeType).toBe(NodeType.FILE);
      expect(node?.parentId).toBe(drawingLibId);
      expect(node?.size).toBe(4096);
      // P0 回归：另存为到库必须产生可用节点（path 非空 + 真实落盘内容）
      expect(node?.path).toBeTruthy();
      expect(response.body.data.path).toBe(node?.path);
    });

    it("T3-S10: 管理员删除库节点成功（永久删除）", async () => {
      const target = await insertLibraryFile(drawingLibId, `t3-to-delete-${suffix}.mxweb`, {
        size: 512,
        fileHash: "t3-hash-delete",
      });

      await request(app.getHttpServer())
        .delete(`/v1/library/drawing/nodes/${target.id}`)
        .set("Authorization", `Bearer ${adminUser.token}`)
        .expect(200);

      const deleted = await prisma.fileSystemNode.findUnique({
        where: { id: target.id },
      });
      expect(deleted).toBeNull();
    });
  });

  // ============ T4 图库文件配额：扣减与回收 ============

  describe("T4: 配额——库上下文跳过、引用占用项目用量、删除回收", () => {
    let quotaFileId: string;
    let quotaRefId: string;

    beforeAll(async () => {
      const quotaFile = await insertLibraryFile(drawingLibId, `t4-quota-file-${suffix}.mxweb`, {
        size: 3 * MB,
        fileHash: "t4-hash-quota",
      });
      quotaFileId = quotaFile.id;
    });

    afterEach(async () => {
      await setProjectSizeQuota(100);
    });

    it("T4-S1: 引用图库文件到项目后，项目用量扣减（usage = 文件大小）", async () => {
      const usageBefore = await projectUsage(projectId);
      quotaRefId = await copyLibraryNodeTo(quotaFileId, projectId);
      const usageAfter = await projectUsage(projectId);

      expect(usageAfter).toBe(usageBefore + 3 * MB);
    });

    it("T4-S2: 配额 1MB 时库内 save-as 6MB 仍成功（公共库跳过字节配额）", async () => {
      await setProjectSizeQuota(1);
      const saveAsPath = path.join(tempDir, "t4-lib-save.mxweb");
      fs.writeFileSync(saveAsPath, Buffer.alloc(6 * MB));

      const response = await request(app.getHttpServer())
        .post("/v1/library/drawing/save-as")
        .set("Authorization", `Bearer ${adminUser.token}`)
        .field("targetParentId", drawingLibId)
        .field("fileName", `t4-lib-save-${suffix}`)
        .attach("file", saveAsPath)
        .expect(200);

      const nodeId = response.body.data.nodeId;
      createdNodeIds.push(nodeId);
      const node = await prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });
      expect(node?.size).toBe(6 * MB);
      // P0 回归：库内 save-as 节点必须落盘（path 非空，供缩略图/下载/引用使用）
      expect(node?.path).toBeTruthy();
    });

    it("T4-S3: 配额 1MB 时项目内复制 3MB 文件被拒（403 QUOTA_EXCEEDED）", async () => {
      await setProjectSizeQuota(1);

      const response = await request(app.getHttpServer())
        .post(`/v1/file-system/nodes/${quotaRefId}/copy`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .send({ targetParentId: projectId })
        .expect(403);

      expect(response.body.code).toBe("QUOTA_EXCEEDED");
      expect(response.body.restrictionKey).toBe(PROJECT_SIZE_QUOTA_KEY);
    });

    it("T4-S4: 删除项目内引用文件后用量回收（usage 减少 3MB）", async () => {
      const usageBefore = await projectUsage(projectId);
      expect(usageBefore).toBeGreaterThanOrEqual(3 * MB);

      await request(app.getHttpServer())
        .delete(`/v1/file-system/nodes/${quotaRefId}`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .expect(200);

      const usageAfter = await projectUsage(projectId);
      expect(usageAfter).toBe(usageBefore - 3 * MB);

      const ref = await prisma.fileSystemNode.findUnique({
        where: { id: quotaRefId },
      });
      expect(ref?.deletedAt).not.toBeNull();
    });
  });

  // ============ T5 悬挂引用：删除/移动库源文件后的行为 ============

  describe("T5: 悬挂引用——库源删除/移动后项目引用不受影响", () => {
    let hangFileId: string;
    let hangRefId: string;
    let moveFileId: string;
    let moveRefId: string;
    let subFolderId: string;

    beforeAll(async () => {
      const hangFile = await insertLibraryFile(drawingLibId, `t5-hang-${suffix}.mxweb`, {
        size: 2048,
        fileHash: "t5-hash-hang",
      });
      hangFileId = hangFile.id;
      hangRefId = await copyLibraryNodeTo(hangFileId, projectId);

      const moveFile = await insertLibraryFile(drawingLibId, `t5-move-${suffix}.mxweb`, {
        size: 2048,
        fileHash: "t5-hash-move",
      });
      moveFileId = moveFile.id;
      moveRefId = await copyLibraryNodeTo(moveFileId, projectId);

      subFolderId = await createLibraryFolder(drawingLibId, `T5 子目录 ${suffix}`);
    });

    it("T5-S1: 永久删除库源文件后，项目内引用节点仍存活（fileHash 引用保护）", async () => {
      await request(app.getHttpServer())
        .delete(`/v1/library/drawing/nodes/${hangFileId}`)
        .set("Authorization", `Bearer ${adminUser.token}`)
        .expect(200);

      const source = await prisma.fileSystemNode.findUnique({
        where: { id: hangFileId },
      });
      expect(source).toBeNull();

      const ref = await prisma.fileSystemNode.findUnique({
        where: { id: hangRefId },
      });
      expect(ref).toBeDefined();
      expect(ref?.deletedAt).toBeNull();
      expect(ref?.fileHash).toBe("t5-hash-hang");
    });

    it("T5-S2: 删除库源后项目侧仍可浏览到引用节点（悬挂引用可读）", async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/nodes/${projectId}/children`)
        .set("Authorization", `Bearer ${regularUser.token}`)
        .expect(200);

      const nodeIds = response.body.data.nodes.map(
        (n: { id: string }) => n.id
      );
      expect(nodeIds).toContain(hangRefId);
    });

    it("T5-S3: 移动库源文件到子目录后，项目引用节点 path/fileHash 保持不变", async () => {
      const refBefore = await prisma.fileSystemNode.findUnique({
        where: { id: moveRefId },
      });

      await request(app.getHttpServer())
        .post(`/v1/library/drawing/nodes/${moveFileId}/move`)
        .set("Authorization", `Bearer ${adminUser.token}`)
        .send({ targetParentId: subFolderId })
        .expect(200);

      const moved = await prisma.fileSystemNode.findUnique({
        where: { id: moveFileId },
      });
      expect(moved?.parentId).toBe(subFolderId);

      const refAfter = await prisma.fileSystemNode.findUnique({
        where: { id: moveRefId },
      });
      expect(refAfter?.path).toBe(refBefore?.path);
      expect(refAfter?.fileHash).toBe(refBefore?.fileHash);
      expect(refAfter?.deletedAt).toBeNull();
    });
  });
});
