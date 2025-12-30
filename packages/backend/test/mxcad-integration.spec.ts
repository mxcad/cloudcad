import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { MxCadModule } from '../src/mxcad/mxcad.module';
import { MxCadService } from '../src/mxcad/mxcad.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';
import { JwtService } from '@nestjs/jwt';
import { MxCadPermissionService } from '../src/mxcad/mxcad-permission.service';
import { FileUploadManagerService } from '../src/mxcad/services/file-upload-manager.service';
import { FileSystemNodeService } from '../src/mxcad/services/filesystem-node.service';
import { FileConversionService } from '../src/mxcad/services/file-conversion.service';

describe('MxCAD External Reference Integration Tests', () => {
  let app: INestApplication;
  let mxCadService: MxCadService;
  const testFileHash = 'test_integration_hash_1234567890';
  const uploadPath = path.join(__dirname, '..', '..', '..', 'uploads');
  const hashDir = path.join(uploadPath, testFileHash);

  beforeAll(async () => {
    // 创建测试目录和预加载数据
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    if (!fs.existsSync(hashDir)) {
      fs.mkdirSync(hashDir, { recursive: true });
    }

    // 创建预加载数据文件
    const preloadingData = {
      tz: false,
      src_file_md5: testFileHash,
      images: ['image1.png', 'image2.jpg'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    fs.writeFileSync(
      path.join(hashDir, `${testFileHash}.dwg.mxweb_preloading.json`),
      JSON.stringify(preloadingData)
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MxCadModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    mxCadService = moduleFixture.get<MxCadService>(MxCadService);
    await app.init();
  });

  afterAll(async () => {
    // 清理测试文件
    if (fs.existsSync(hashDir)) {
      fs.rmSync(hashDir, { recursive: true, force: true });
    }
    if (app) {
      await app.close();
    }
  });

  describe('getPreloadingData', () => {
    it('应该成功获取预加载数据', async () => {
      const result = await mxCadService.getPreloadingData(testFileHash);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('tz', false);
      expect(result).toHaveProperty('src_file_md5', testFileHash);
      expect(result?.images).toHaveLength(2);
      expect(result?.externalReference).toHaveLength(2);
    });

    it('当文件不存在时应该返回 null', async () => {
      const result = await mxCadService.getPreloadingData(
        'nonexistent_hash_12345678901234567890123456789012'
      );
      expect(result).toBeNull();
    });

    it('当哈希值格式无效时应该返回 null', async () => {
      const result = await mxCadService.getPreloadingData('invalid');
      expect(result).toBeNull();
    });
  });

  describe('checkExternalReferenceExists', () => {
    it('应该正确检查不存在的外部参照', async () => {
      const exists = await mxCadService.checkExternalReferenceExists(
        testFileHash,
        'ref1.dwg'
      );
      expect(exists).toBe(false);
    });

    it('应该在上传外部参照后检测到文件存在', async () => {
      // 先创建一个模拟的外部参照文件
      const refFilePath = path.join(hashDir, 'ref1.dwg.mxweb');
      fs.writeFileSync(refFilePath, 'test mxweb content');

      const exists = await mxCadService.checkExternalReferenceExists(
        testFileHash,
        'ref1.dwg'
      );

      expect(exists).toBe(true);

      // 清理
      fs.unlinkSync(refFilePath);
    });

    it('应该正确处理图片文件的检查', async () => {
      const exists = await mxCadService.checkExternalReferenceExists(
        testFileHash,
        'image1.png'
      );
      expect(exists).toBe(false);
    });
  });

  describe('getExternalReferenceStats', () => {
    it('应该返回正确的外部参照统计信息', async () => {
      const stats = await mxCadService.getExternalReferenceStats(testFileHash);

      expect(stats).toHaveProperty('hasMissing', true);
      expect(stats).toHaveProperty('missingCount', 4); // 2个dwg + 2个图片
      expect(stats).toHaveProperty('totalCount', 4);
      expect(stats.references).toHaveLength(4);
    });

    it('应该过滤掉 URL 类型的外部参照', async () => {
      // 创建包含 URL 的预加载数据
      const urlPreloadingData = {
        tz: false,
        src_file_md5: testFileHash,
        images: ['http://example.com/image.png', 'local_image.png'],
        externalReference: ['ref1.dwg', 'https://example.com/ref2.dwg'],
      };

      fs.writeFileSync(
        path.join(hashDir, `${testFileHash}.dwg.mxweb_preloading.json`),
        JSON.stringify(urlPreloadingData)
      );

      const stats = await mxCadService.getExternalReferenceStats(testFileHash);

      // 应该只计算本地文件，不计算 URL
      expect(stats.references.length).toBeLessThanOrEqual(2);
    });
  });

  describe('文件安全性验证', () => {
    it('应该防止路径遍历攻击', async () => {
      // 验证 isValidFileHash 方法
      expect(
        await mxCadService.getPreloadingData('../../etc/passwd')
      ).toBeNull();
      expect(await mxCadService.getPreloadingData('/etc/passwd')).toBeNull();
      expect(await mxCadService.getPreloadingData('abc')).toBeNull();
    });

    it('应该验证有效的哈希值格式', async () => {
      // 32位十六进制哈希值应该有效（会被尝试查找）
      const validHash = 'a'.repeat(32);
      const result = await mxCadService.getPreloadingData(validHash);
      // 如果文件不存在会返回 null，这是预期的
      expect(result).toBeNull();
    });
  });
});
