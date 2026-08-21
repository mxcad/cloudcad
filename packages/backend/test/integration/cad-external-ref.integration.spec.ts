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
import { ExternalRefService } from '../../src/mxcad/external-ref/external-ref.service';
import { ExternalReferenceUpdateService } from '../../src/mxcad/external-ref/external-reference-update.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';

describe('CAD External Reference Integration Tests', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let externalRefService: ExternalRefService;
  let externalReferenceUpdateService: ExternalReferenceUpdateService;
  let configService: ConfigService;

  let authToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testFileId: string;
  let testFileHash: string;
  let tempDir: string;
  let nodeStorageRoot: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FileConversionService)
      .useValue({
        convertFile: jest.fn().mockResolvedValue({ isOk: true, ret: { code: 0, tz: true } }),
        needsConversion: jest.fn().mockReturnValue(true),
        getConvertedExtension: jest.fn().mockReturnValue('.mxweb'),
      })
      .compile();

    app = initIntegrationApp(moduleFixture.createNestApplication());
    await app.init();

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
    externalRefService = moduleFixture.get<ExternalRefService>(ExternalRefService);
    externalReferenceUpdateService = moduleFixture.get<ExternalReferenceUpdateService>(ExternalReferenceUpdateService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    tempDir = path.join(process.cwd(), 'temp-test-extref-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    // 注册测试用户（获取有效 token）
    const testUserEmail = `extref-${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testUserEmail,
        username: `extref${Date.now().toString().slice(-8)}`,
        password: 'ExtRef@123456',
        nickname: 'Ext Ref User',
      })
      .expect(201);

    testUserId = registerResponse.body.data.user.id;
    authToken = registerResponse.body.data.accessToken;

    // 创建测试项目
    const projectResponse = await request(app.getHttpServer())
      .post('/v1/file-system/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'ExtRef Test Project',
        description: 'External reference integration test',
      })
      .expect(201);
    testProjectId = projectResponse.body.data.id;

    // 创建模拟的 CAD 文件节点（DWG 已上传完成）
    testFileHash = 'd41d8cd98f00b204e9800998ecf8427e';
    const monthDir = new Date().toISOString().slice(0, 7).replace('-', '');
    const fileNode = await databaseService.fileSystemNode.create({
      data: {
        name: 'test-drawing.dwg',
        nodeType: NodeType.FILE,
        parentId: testProjectId,
        projectId: testProjectId,
        ownerId: testUserId,
        fileHash: testFileHash,
        fileStatus: FileStatus.COMPLETED,
      },
    });
    testFileId = fileNode.id;

    // 更新节点 path（指向真实存储目录）
    const filesDataPath = configService.get<string>('filesDataPath');
    nodeStorageRoot = path.join(filesDataPath, monthDir, testFileId);
    fs.mkdirSync(nodeStorageRoot, { recursive: true });
    await databaseService.fileSystemNode.update({
      where: { id: testFileId },
      data: { path: `${monthDir}/${testFileId}/${testFileId}.dwg.mxweb` },
    });

    // 写入 preloading 数据
    fs.writeFileSync(
      path.join(nodeStorageRoot, `${testFileId}.dwg.mxweb_preloading.json`),
      JSON.stringify({
        tz: true,
        src_file_md5: testFileHash,
        images: ['image1.png'],
        externalReference: ['ref1.dwg'],
      })
    );

    // 写入工作文件
    fs.writeFileSync(
      path.join(nodeStorageRoot, `${testFileId}.dwg.mxweb`),
      'mock mxweb content'
    );

    // 创建外部参照物理文件目录
    const extRefDir = path.join(nodeStorageRoot, testFileHash);
    fs.mkdirSync(extRefDir, { recursive: true });
    fs.writeFileSync(path.join(extRefDir, 'ref1.dwg.mxweb'), 'mock ref dwg');
    fs.writeFileSync(
      path.join(extRefDir, 'image1.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
  }, 60000);

  afterAll(async () => {
    if (databaseService) {
      try {
        if (testFileId) {
          await databaseService.fileSystemNode.deleteMany({
            where: { id: testFileId },
          });
        }
        if (testProjectId) {
          await databaseService.fileSystemNode.deleteMany({
            where: { id: testProjectId },
          });
        }
        if (testUserId) {
          await databaseService.user.deleteMany({
            where: { id: testUserId },
          });
        }
      } catch (error) {
        console.error('Error cleaning up test data:', error);
      }
    }

    try {
      if (nodeStorageRoot && fs.existsSync(nodeStorageRoot)) {
        fs.rmSync(path.dirname(nodeStorageRoot), { recursive: true, force: true });
      }
    } catch {}

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    if (app) {
      await app.close();
    }
  });

  describe('1. External Reference Upload - DWG', () => {
    it('should upload external reference DWG file', async () => {
      const testDwgPath = path.join(tempDir, 'test-ref.dwg');
      fs.writeFileSync(testDwgPath, 'Mock DWG content');

      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/up_ext_reference_dwg/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testDwgPath)
        .field('ext_ref_file', 'ref1.dwg')
        .field('nodeId', testFileId)
        .field('hash', testFileHash);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      if (response.body) {
        expect(response.body).toHaveProperty('code');
      }
    });
  });

  describe('2. External Reference Upload - Image', () => {
    it('should upload external reference image file', async () => {
      const testImagePath = path.join(tempDir, 'test-image.png');
      fs.writeFileSync(testImagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header

      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/up_ext_reference_image/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImagePath)
        .field('ext_ref_file', 'image1.png')
        .field('nodeId', testFileId)
        .field('updatePreloading', 'true');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      if (response.body) {
        expect(response.body).toHaveProperty('code');
      }
    });
  });

  describe('3. Get Preloading Data', () => {
    it('should get preloading data for a CAD file', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/mxcad/preloading/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.body.data).toBeDefined();

      if (response.body.data) {
        expect(response.body.data.src_file_md5).toBe(testFileHash);
        expect(response.body.data).toHaveProperty('images');
        expect(response.body.data).toHaveProperty('externalReference');
        expect(Array.isArray(response.body.data.images)).toBe(true);
        expect(Array.isArray(response.body.data.externalReference)).toBe(true);
      }
    });

    it('should return error when preloading data does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/mxcad/preloading/non-existent-id-12345')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('4. Check External Reference Existence', () => {
    it('should check if external reference exists', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/check-reference`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ fileName: 'ref1.dwg' });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      if (response.body.data) {
        expect(response.body.data).toHaveProperty('exists');
        expect(typeof response.body.data.exists).toBe('boolean');
      }
    });

    it('should return false when fileName is empty', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/check-reference`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.body.data).toEqual({ exists: false });
    });
  });

  describe('5. Refresh External References', () => {
    it('should refresh external references information', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/refresh-external-references`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      if (response.body.data) {
        expect(response.body.data).toHaveProperty('code');
        expect(response.body.data).toHaveProperty('stats');
      }
    });

    it('should include statistics in refresh response', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/refresh-external-references`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);

      if (response.body.data && response.body.data.stats) {
        expect(response.body.data.stats).toHaveProperty('hasMissing');
        expect(response.body.data.stats).toHaveProperty('missingCount');
        expect(response.body.data.stats).toHaveProperty('totalCount');
        expect(response.body.data.stats).toHaveProperty('references');
        expect(Array.isArray(response.body.data.stats.references)).toBe(true);
      }
    });
  });

  describe('6. External Reference Services - Unit Tests', () => {
    it('should get external reference directory name', async () => {
      const dirName = await externalRefService.getExternalRefDirName(testFileId);
      expect(typeof dirName).toBe('string');
      expect(dirName.length).toBeGreaterThan(0);
      expect(dirName).toBe(testFileHash);
    });

    it('should get external reference statistics', async () => {
      const stats = await externalReferenceUpdateService.getStats(testFileId);
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('hasMissing');
      expect(stats).toHaveProperty('missingCount');
      expect(stats).toHaveProperty('totalCount');
      expect(stats).toHaveProperty('references');
      expect(Array.isArray(stats.references)).toBe(true);
      expect(stats.totalCount).toBeGreaterThan(0);
    });

    it('should check if external reference exists', async () => {
      const exists = await externalReferenceUpdateService.checkExists(testFileId, 'ref1.dwg');
      expect(exists).toBe(true);
    });

    it('should get preloading data', async () => {
      const preloadingData = await externalReferenceUpdateService.getPreloadingData(testFileId);
      expect(preloadingData).toBeDefined();
      if (preloadingData) {
        expect(preloadingData).toHaveProperty('src_file_md5');
        expect(preloadingData).toHaveProperty('images');
        expect(preloadingData).toHaveProperty('externalReference');
      }
    });
  });

  describe('7. Authentication and Authorization', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/mxcad/preloading/${testFileId}`);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid authentication token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/mxcad/preloading/${testFileId}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
