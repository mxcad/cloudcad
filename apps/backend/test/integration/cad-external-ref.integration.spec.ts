///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import { JwtService } from '@nestjs/jwt';

// Import required modules and services
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { ExternalRefService } from '../../src/mxcad/external-ref/external-ref.service';
import { ExternalReferenceUpdateService } from '../../src/mxcad/external-ref/external-reference-update.service';
import { ExternalReferenceHandler } from '../../src/mxcad/external-ref/external-reference-handler.service';

describe('CAD External Reference Integration Tests', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let externalRefService: ExternalRefService;
  let externalReferenceUpdateService: ExternalReferenceUpdateService;
  let externalReferenceHandler: ExternalReferenceHandler;
  let jwtService: JwtService;
  let authToken: string;
  let testUserId: string;
  let testProjectId: string;
  let testFileId: string;
  let testFileHash: string;
  let tempDir: string;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    tempDir = path.join(process.cwd(), 'temp-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create testing module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get services
    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
    externalRefService = moduleFixture.get<ExternalRefService>(ExternalRefService);
    externalReferenceUpdateService = moduleFixture.get<ExternalReferenceUpdateService>(ExternalReferenceUpdateService);
    externalReferenceHandler = moduleFixture.get<ExternalReferenceHandler>(ExternalReferenceHandler);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test user
    const testUser = await databaseService.user.create({
      data: {
        email: 'test-external-ref@example.com',
        username: 'testexternalref',
        password: 'hashedpassword123',
        nickname: 'Test External Ref User',
        role: 'USER',
        status: 'ACTIVE',
      },
    });
    testUserId = testUser.id;

    // Generate auth token
    authToken = jwtService.sign({
      sub: testUser.id,
      email: testUser.email,
      username: testUser.username,
      role: testUser.role,
    });

    // Create test project
    const testProject = await databaseService.fileSystemNode.create({
      data: {
        name: 'Test External Ref Project',
        isFolder: true,
        isRoot: true,
        ownerId: testUser.id,
      },
    });
    testProjectId = testProject.id;

    // Create test CAD file
    const sourceFileMd5 = 'd41d8cd98f00b204e9800998ecf8427e';
    testFileHash = sourceFileMd5;
    const testFile = await databaseService.fileSystemNode.create({
      data: {
        name: 'test-drawing.dwg',
        isFolder: false,
        parentId: testProjectId,
        ownerId: testUser.id,
        fileHash: sourceFileMd5,
        fileStatus: 'COMPLETED',
        externalRefInfo: {
          hasMissing: true,
          missingCount: 2,
          references: [
            { name: 'ref1.dwg', type: 'dwg', exists: false, required: true },
            { name: 'image1.png', type: 'image', exists: false, required: true },
          ],
        },
      },
    });
    testFileId = testFile.id;

    // Create preloading data file
    const filesDataPath = process.env.FILES_DATA_PATH || 'data/files';
    const fileDir = path.join(filesDataPath, testProjectId, testFileId);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    const preloadingData = {
      tz: true,
      src_file_md5: sourceFileMd5,
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };
    fs.writeFileSync(
      path.join(fileDir, `${testFileId}.dwg.mxweb_preloading.json`),
      JSON.stringify(preloadingData)
    );

    // Create external reference directory
    const extRefDir = path.join(fileDir, sourceFileMd5);
    if (!fs.existsSync(extRefDir)) {
      fs.mkdirSync(extRefDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (databaseService) {
      try {
        await databaseService.fileSystemNode.deleteMany({
          where: {
            OR: [
              { id: testFileId },
              { id: testProjectId },
            ],
          },
        });
        await databaseService.user.deleteMany({
          where: { id: testUserId },
        });
      } catch (error) {
        console.error('Error cleaning up test data:', error);
      }
    }

    // Cleanup temp files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    if (app) {
      await app.close();
    }
  });

  describe('1. External Reference Upload - DWG', () => {
    it('should upload external reference DWG file', async () => {
      // Create a test DWG file
      const testDwgPath = path.join(tempDir, 'test-ref.dwg');
      fs.writeFileSync(testDwgPath, 'Mock DWG content');

      // Upload external reference
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/up_ext_reference_dwg/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testDwgPath)
        .field('ext_ref_file', 'ref1.dwg')
        .field('nodeId', testFileId)
        .field('hash', 'd41d8cd98f00b204e9800998ecf8427e');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      
      if (response.body) {
        expect(response.body).toHaveProperty('code');
      }
    });
  });

  describe('2. External Reference Upload - Image', () => {
    it('should upload external reference image file', async () => {
      // Create a test image file
      const testImagePath = path.join(tempDir, 'test-image.png');
      fs.writeFileSync(testImagePath, Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header

      // Upload external reference
      const response = await request(app.getHttpServer())
        .post('/v1/mxcad/up_ext_reference_image')
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
        .get(`/v1/mxcad/file/${testFileId}/preloading`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.body).toBeDefined();
      
      if (response.body) {
        expect(response.body).toHaveProperty('src_file_md5');
        expect(response.body).toHaveProperty('images');
        expect(response.body).toHaveProperty('externalReference');
        expect(Array.isArray(response.body.images)).toBe(true);
        expect(Array.isArray(response.body.externalReference)).toBe(true);
      }
    });

    it('should return 404 when preloading data does not exist', async () => {
      const nonExistentId = 'non-existent-id-12345';
      const response = await request(app.getHttpServer())
        .get(`/v1/mxcad/file/${nonExistentId}/preloading`)
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
      
      if (response.body) {
        expect(response.body).toHaveProperty('exists');
        expect(typeof response.body.exists).toBe('boolean');
      }
    });

    it('should validate required parameters', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/check-reference`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({}); // Missing fileName

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('5. Refresh External References', () => {
    it('should refresh external references information', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/refresh-external-references`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      
      if (response.body) {
        expect(response.body).toHaveProperty('code');
        expect(response.body).toHaveProperty('stats');
      }
    });

    it('should include statistics in refresh response', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/mxcad/file/${testFileId}/refresh-external-references`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(200);
      
      if (response.body && response.body.stats) {
        expect(response.body.stats).toHaveProperty('hasMissing');
        expect(response.body.stats).toHaveProperty('missingCount');
        expect(response.body.stats).toHaveProperty('totalCount');
        expect(response.body.stats).toHaveProperty('references');
        expect(Array.isArray(response.body.stats.references)).toBe(true);
      }
    });
  });

  describe('6. External Reference Services - Unit Tests', () => {
    it('should get external reference directory name', async () => {
      const dirName = await externalRefService.getExternalRefDirName(testFileId);
      expect(typeof dirName).toBe('string');
      expect(dirName.length).toBeGreaterThan(0);
    });

    it('should get external reference statistics', async () => {
      const stats = await externalReferenceUpdateService.getStats(testFileId);
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('hasMissing');
      expect(stats).toHaveProperty('missingCount');
      expect(stats).toHaveProperty('totalCount');
      expect(stats).toHaveProperty('references');
      expect(Array.isArray(stats.references)).toBe(true);
    });

    it('should check if external reference exists', async () => {
      const exists = await externalReferenceUpdateService.checkExists(testFileId, 'ref1.dwg');
      expect(typeof exists).toBe('boolean');
    });

    it('should get preloading data', async () => {
      const preloadingData = await externalReferenceUpdateService.getPreloadingData(testFileId);
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
        .get(`/v1/mxcad/file/${testFileId}/preloading`);

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid authentication token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/mxcad/file/${testFileId}/preloading`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});

