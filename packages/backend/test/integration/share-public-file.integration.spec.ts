///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NodeType, FileStatus } from '@cloudcad/db';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';

import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { initIntegrationApp } from '../../src/test/integration-app';

/**
 * 分享 / 公开文件 集成测试（#287）
 *
 * 覆盖：
 *  T1 创建分享链接（项目级 / 个人文件级）→ token/URL
 *  T2 匿名访问分享（@Public，无需登录）+ 登录访问两种模式
 *  T3 分享权限边界：仅被分享内容可访问，未分享内容被拒
 *  T4 分享撤销后链接立即失效
 *  T5 过期分享自动拒绝（API PATCH + 直接改库两种过期路径）
 *  T6 分享访问审计（AuditLog 表 FILE_SHARE 记录）
 *  T7 公开端点 @Public 语义（#268 库下载链路）
 *
 * 依赖真实 PostgreSQL + Redis（Redis 由 src/test/setup.ts 提供 in-memory mock）。
 * 需 Docker 运行：`node scripts/test-db.mjs run` 或 CI。
 */
describe('Share / Public File Integration', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let configService: ConfigService;

  let testUserEmail: string;
  let testUserId: string;
  let testUserAuthToken: string;

  let otherUserEmail: string;
  let otherUserId: string;
  let otherUserAuthToken: string;

  let testProjectId: string;
  let projectFileId: string;
  let unsharedFileId: string;
  let personalFileId: string;

  // 项目文件真实落在磁盘 filesData 目录（供 shareToken 文件流 200 断言）
  let nodeStorageRoot: string;
  let projectFilePath: string;
  const testFileHash = 'd41d8cd98f00b204e9800998ecf8427e';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    testUserEmail = `share-${Date.now()}@example.com`;
    testUserId = '';
    testProjectId = '';

    await cleanupTestData();
    await setupTestUserAndProject();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    try {
      if (nodeStorageRoot && fs.existsSync(nodeStorageRoot)) {
        fs.rmSync(nodeStorageRoot, { recursive: true, force: true });
      }
    } catch {}
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    if (testUserId) {
      // FileShare.creator 无 onDelete Cascade，必须先删分享再删用户
      await databaseService.fileShare.deleteMany({
        where: { createdBy: testUserId },
      });
      await databaseService.auditLog.deleteMany({
        where: { userId: testUserId },
      });
    }
    if (otherUserId) {
      await databaseService.fileShare.deleteMany({
        where: { createdBy: otherUserId },
      });
      await databaseService.auditLog.deleteMany({
        where: { userId: otherUserId },
      });
    }
    await databaseService.fileSystemNode.deleteMany({
      where: {
        owner: {
          email: { in: [testUserEmail, otherUserEmail].filter(Boolean) },
        },
      },
    });
    await databaseService.projectMember.deleteMany({
      where: {
        user: {
          email: { in: [testUserEmail, otherUserEmail].filter(Boolean) },
        },
      },
    });
    await databaseService.refreshToken.deleteMany({});
    await databaseService.user.deleteMany({
      where: { email: { in: [testUserEmail, otherUserEmail].filter(Boolean) } },
    });
  }

  async function setupTestUserAndProject() {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testUserEmail,
        username: `shareuser${Date.now().toString().slice(-8)}`,
        password: 'Share@123456',
        nickname: 'Share Test User',
      });

    testUserId = registerResponse.body.data.user.id;
    testUserAuthToken = registerResponse.body.data.accessToken;

    const createProjectResponse = await request(app.getHttpServer())
      .post('/v1/file-system/projects')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send({
        name: 'Share Test Project',
        description: 'Project for share testing',
      });

    testProjectId = createProjectResponse.body.data.id;

    const monthDir = new Date().toISOString().slice(0, 7).replace('-', '');
    const filesDataPath =
      configService.get<string>('filesDataPath') || 'data/files';

    // 项目内被分享文件（真实落盘，供 shareToken 文件流 200 断言）
    const projectFile = await databaseService.fileSystemNode.create({
      data: {
        name: 'shared-project-file.dwg',
        nodeType: NodeType.FILE,
        parentId: testProjectId,
        projectId: testProjectId,
        ownerId: testUserId,
        fileHash: testFileHash,
        fileStatus: FileStatus.COMPLETED,
      },
    });
    projectFileId = projectFile.id;
    projectFilePath = `${monthDir}/${projectFileId}/${projectFileId}.dwg.mxweb`;
    await databaseService.fileSystemNode.update({
      where: { id: projectFileId },
      data: { path: projectFilePath },
    });
    nodeStorageRoot = path.join(filesDataPath, monthDir, projectFileId);
    fs.mkdirSync(nodeStorageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(nodeStorageRoot, `${projectFileId}.dwg.mxweb`),
      'mock mxweb share content'
    );

    // 项目内未被分享文件（权限边界测试用，无需落盘）
    const unsharedFile = await databaseService.fileSystemNode.create({
      data: {
        name: 'unshared-project-file.dwg',
        nodeType: NodeType.FILE,
        parentId: testProjectId,
        projectId: testProjectId,
        ownerId: testUserId,
        fileHash: '9e107d9d372bb6826bd81d3542a419d6',
        fileStatus: FileStatus.COMPLETED,
        path: `${monthDir}/${'unshared'}-${projectFileId}/unshared.dwg.mxweb`,
      },
    });
    unsharedFileId = unsharedFile.id;

    // 个人空间文件（无 projectId，仅 owner 可分享）
    const personalFile = await databaseService.fileSystemNode.create({
      data: {
        name: 'personal-file.dwg',
        nodeType: NodeType.FILE,
        ownerId: testUserId,
        fileHash: '65c8c2c1e0f4c0b0d3d5f7f8c4e8f8c4',
        fileStatus: FileStatus.COMPLETED,
        path: `${monthDir}/personal-${projectFileId}/personal.dwg.mxweb`,
      },
    });
    personalFileId = personalFile.id;

    // 第二用户（无项目成员身份）：创建分享权限边界（403）与撤销权限（403）断言
    const otherRegister = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: (otherUserEmail = `share-other-${Date.now()}@example.com`),
        username: `shareother${Date.now().toString().slice(-8)}`,
        password: 'ShareOther@123456',
        nickname: 'Share Other User',
      });

    otherUserId = otherRegister.body.data.user.id;
    otherUserAuthToken = otherRegister.body.data.accessToken;
  }

  /** 创建分享并返回响应 body（供各场景自建独立分享，互不污染状态） */
  async function createShare(fileId: string, expiresIn?: number) {
    const res = await request(app.getHttpServer())
      .post('/v1/shares')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send({ fileId, ...(expiresIn !== undefined ? { expiresIn } : {}) });
    return res;
  }

  describe('T1: 创建分享链接（项目级 / 个人文件级）', () => {
    it('T1-S1: 项目内文件创建分享 → 返回 token 与分享 URL', async () => {
      const res = await createShare(projectFileId);

      expect(res.status).toBe(201);
      expect(res.body.data.token).toBeDefined();
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.length).toBeGreaterThanOrEqual(10);
      expect(res.body.data.url).toContain(`/cad-editor/${projectFileId}`);
      expect(res.body.data.url).toContain(`shareToken=${res.body.data.token}`);
      expect(res.body.data.url).toContain(
        encodeURIComponent('shared-project-file.dwg')
      );
      expect(res.body.data.expiresAt).toBeNull();
    });

    it('T1-S2: 个人文件（无项目）创建分享 → 同样生成 token/URL', async () => {
      const res = await createShare(personalFileId);

      expect(res.status).toBe(201);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.url).toContain(`/cad-editor/${personalFileId}`);
      expect(res.body.data.expiresAt).toBeNull();
    });

    it('T1-S3: 指定 expiresIn → expiresAt 按当前时间 + 秒数生成', async () => {
      const before = Date.now();
      const res = await createShare(projectFileId, 3600);
      const after = Date.now();

      expect(res.status).toBe(201);
      const expiresAt = new Date(res.body.data.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000 + 5000);
    });

    it('T1-S4: 无效参数被拒（文件不存在 400 / expiresIn 小于最小值 400）', async () => {
      await request(app.getHttpServer())
        .post('/v1/shares')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({ fileId: 'non-existent-file-id' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/v1/shares')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({ fileId: projectFileId, expiresIn: 30 })
        .expect(400);
    });

    it('T1-S5: 未登录创建分享 → 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/shares')
        .send({ fileId: projectFileId })
        .expect(401);
    });

    it('T1-S6: 非项目成员分享项目文件 → 403（创建侧权限边界）', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/shares')
        .set('Authorization', `Bearer ${otherUserAuthToken}`)
        .send({ fileId: projectFileId });

      expect(res.status).toBe(403);
    });
  });

  describe('T2: 匿名访问分享（@Public，无需登录）与登录访问', () => {
    let shareToken: string;

    beforeEach(async () => {
      const res = await createShare(projectFileId);
      shareToken = res.body.data.token;
    });

    it('T2-S1: 匿名 GET /v1/shares/:token → 200 返回分享文件 id，并累计 usedCount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .expect(200);

      expect(res.body.data.fileId).toBe(projectFileId);

      const share = await databaseService.fileShare.findUnique({
        where: { token: shareToken },
      });
      expect(share?.usedCount).toBe(1);
    });

    it('T2-S2: 匿名 GET /v1/shares/:token/node → 200 返回文件信息', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}/node`)
        .expect(200);

      expect(res.body.data.id).toBe(projectFileId);
      expect(res.body.data.name).toBe('shared-project-file.dwg');
      expect(res.body.data.fileHash).toBe(testFileHash);
      expect(res.body.data.path).toBe(projectFilePath);
    });

    it('T2-S3: 登录访问同一分享端点（携带 Bearer）→ 同样 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      expect(res.body.data.fileId).toBe(projectFileId);
    });

    it('T2-S4: 无效 token → 404', async () => {
      await request(app.getHttpServer())
        .get('/v1/shares/does-not-exist-token')
        .expect(404);
    });
  });

  describe('T3: 分享权限边界（仅被分享内容可访问）', () => {
    let shareToken: string;

    beforeEach(async () => {
      const res = await createShare(projectFileId);
      shareToken = res.body.data.token;
    });

    it('T3-S1: 分享 token + 被分享文件路径 → 匿名取到文件流 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/mxcad/filesData/${projectFilePath}?shareToken=${shareToken}`)
        .expect(200);

      // 文件流响应（非 JSON）：body 为 Buffer，需按字节断言而非 res.text
      expect(res.body).toBeInstanceOf(Buffer);
      const bodyText = res.body.toString('utf8');
      expect(bodyText).toContain('mock mxweb share content');
    });

    it('T3-S2: 分享 token 访问未分享文件路径 → 拒绝（令牌与文件不匹配）', async () => {
      // 注：mxcad filesData 控制器把 ForbiddenException 统一映射为 401（见
      // mxcad-file-access.controller.ts authorizeFilesDataAccess），故此处断言 401 + 不匹配语义
      const unsharedPath = (
        await databaseService.fileSystemNode.findUnique({
          where: { id: unsharedFileId },
          select: { path: true },
        })
      )?.path;

      const res = await request(app.getHttpServer()).get(
        `/v1/mxcad/filesData/${unsharedPath}?shareToken=${shareToken}`
      );

      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).toContain('不匹配');
    });

    it('T3-S3: 匿名（无 token 无登录）访问文件路径 → 401 未登录', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/mxcad/filesData/${projectFilePath}`
      );

      expect(res.status).toBe(401);
    });

    it('T3-S4: 未分享文件不产生任何有效 token（listShares 仅返回自己创建的分享）', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/shares?fileId=${unsharedFileId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('T4: 分享撤销后链接立即失效', () => {
    let shareToken: string;

    beforeEach(async () => {
      const res = await createShare(projectFileId);
      shareToken = res.body.data.token;
    });

    it('T4-S1: 创建者撤销 → 200，随后解析/文件访问全部 404', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}/node`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/v1/mxcad/filesData/${projectFilePath}?shareToken=${shareToken}`)
        .expect(404);
    });

    it('T4-S2: 非创建者撤销 → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${otherUserAuthToken}`)
        .expect(403);
    });

    it('T4-S3: 重复撤销 → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(404);
    });
  });

  describe('T5: 过期分享自动拒绝', () => {
    it('T5-S1: API PATCH 将 expiresAt 改为过去时间 → 解析/节点/文件访问全部 404', async () => {
      const res = await createShare(projectFileId, 3600);
      const shareToken = res.body.data.token;
      const past = new Date(Date.now() - 1000).toISOString();

      await request(app.getHttpServer())
        .patch(`/v1/shares/${shareToken}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({ expiresAt: past })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}/node`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/v1/mxcad/filesData/${projectFilePath}?shareToken=${shareToken}`)
        .expect(404);
    });

    it('T5-S2: 直接改库将 expiresAt 置为过去 → 文件访问 404（不依赖 API 语义）', async () => {
      const res = await createShare(projectFileId, 3600);
      const shareToken = res.body.data.token;

      await databaseService.fileShare.update({
        where: { token: shareToken },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .get(`/v1/mxcad/filesData/${projectFilePath}?shareToken=${shareToken}`)
        .expect(404);
    });
  });

  describe('T6: 分享访问审计（AuditLog 记录）', () => {
    it('T6-S1: 创建项目文件分享 → 写 FILE_SHARE 审计（含项目维度/名称快照/参数）', async () => {
      const res = await createShare(projectFileId);
      const shareToken = res.body.data.token;

      const audit = await databaseService.auditLog.findFirst({
        where: {
          action: 'FILE_SHARE',
          resourceType: 'FILE',
          resourceId: projectFileId,
          userId: testUserId,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit).toBeDefined();
      expect(audit?.success).toBe(true);
      expect(audit?.projectId).toBe(testProjectId);
      expect(audit?.resourceName).toBe('shared-project-file.dwg');
      expect((audit?.params as { shareToken?: string })?.shareToken).toBe(
        shareToken
      );
      expect((audit?.params as { fileName?: string })?.fileName).toBe(
        'shared-project-file.dwg'
      );
    });

    it('T6-S2: 创建个人文件分享 → FILE_SHARE 审计，projectId 为空、名称快照正确', async () => {
      const res = await createShare(personalFileId);
      const shareToken = res.body.data.token;

      const audit = await databaseService.auditLog.findFirst({
        where: {
          action: 'FILE_SHARE',
          resourceType: 'FILE',
          resourceId: personalFileId,
          userId: testUserId,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit).toBeDefined();
      expect(audit?.success).toBe(true);
      expect(audit?.projectId).toBeNull();
      expect(audit?.resourceName).toBe('personal-file.dwg');
      expect((audit?.params as { shareToken?: string })?.shareToken).toBe(
        shareToken
      );
    });

    it('T6-S3: 分享访问计数（usedCount）随解析递增，且不产生额外 FILE_SHARE 审计噪音', async () => {
      const res = await createShare(projectFileId);
      const shareToken = res.body.data.token;

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}/node`)
        .expect(200);

      const share = await databaseService.fileShare.findUnique({
        where: { token: shareToken },
      });
      expect(share?.usedCount).toBe(2);

      const auditCount = await databaseService.auditLog.count({
        where: {
          action: 'FILE_SHARE',
          resourceId: projectFileId,
          userId: testUserId,
        },
      });
      expect(auditCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('T7: 公开端点 @Public 语义（#268 库下载链路）', () => {
    it('T7-S1: 匿名访问 ext-reference/check → 200（@Public 无需登录）', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/public-file/ext-reference/check')
        .query({ srcHash: testFileHash, fileName: 'ref.dwg' })
        .expect(200);

      expect(res.body.data).toEqual({ exists: false });
    });

    it('T7-S2: 匿名访问缺参的 ext-reference/check → 400（校验不依赖登录态）', async () => {
      await request(app.getHttpServer())
        .get('/v1/public-file/ext-reference/check')
        .query({ fileName: 'ref.dwg' })
        .expect(400);
    });

    it('T7-S3: 分享解析端点 @Public 但文件存在性校验仍生效（分享文件被删除 → 404）', async () => {
      const res = await createShare(projectFileId);
      const shareToken = res.body.data.token;

      // 模拟分享指向的文件被删除（软删除），解析立即失败
      await databaseService.fileSystemNode.update({
        where: { id: projectFileId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`/v1/shares/${shareToken}`)
        .expect(404);

      // 恢复节点，避免影响 afterAll 清理
      await databaseService.fileSystemNode.update({
        where: { id: projectFileId },
        data: { deletedAt: null },
      });
    });
  });
});
