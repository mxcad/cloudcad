import { Test, TestingModule } from '@nestjs/testing';
import { MxCadService } from './mxcad.service';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from './enums/mxcad-return.enum';
import { MxCadPermissionService } from './mxcad-permission.service';
import { FileUploadManagerService } from './services/file-upload-manager.service';
import { FileSystemNodeService } from './services/filesystem-node.service';
import { FileConversionService } from './services/file-conversion.service';

// Mock fs 模块
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('MxCadService', () => {
  let service: MxCadService;
  let mockConfigService: jest.Mocked<ConfigService>;
  const mockExec = require('child_process').exec as jest.MockedFunction<any>;

  beforeEach(async () => {
    // 重置所有 mock
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
    } as any;

    // Mock 其他依赖服务
    const mockMxCadPermissionService = {
      validateUploadPermission: jest.fn().mockResolvedValue(undefined),
      validateFileAccessPermission: jest.fn().mockResolvedValue(true),
    };

    const mockFileUploadManagerService = {
      checkChunkExist: jest.fn(),
      checkFileExist: jest.fn(),
      uploadChunk: jest.fn(),
      mergeChunksWithPermission: jest.fn(),
      uploadAndConvertFileWithPermission: jest.fn(),
    };

    const mockFileSystemNodeService = {
      inferContextForMxCadApp: jest.fn(),
      checkProjectPermission: jest.fn().mockResolvedValue(true),
    };

    const mockFileConversionService = {
      convertFile: jest.fn(),
      convertFileAsync: jest.fn().mockResolvedValue('task-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MxCadPermissionService,
          useValue: mockMxCadPermissionService,
        },
        {
          provide: FileUploadManagerService,
          useValue: mockFileUploadManagerService,
        },
        {
          provide: FileSystemNodeService,
          useValue: mockFileSystemNodeService,
        },
        {
          provide: FileConversionService,
          useValue: mockFileConversionService,
        },
      ],
    }).compile();

    service = module.get<MxCadService>(MxCadService);

    // 设置默认配置值
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        MXCAD_UPLOAD_PATH: '/tmp/uploads',
        MXCAD_TEMP_PATH: '/tmp/temp',
        MXCAD_ASSEMBLY_PATH: '/path/to/mxcadassembly.exe',
        MXCAD_FILE_EXT: '.mxweb',
        MXCAD_COMPRESSION: 'true',
      };
      return config[key];
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkChunkExist', () => {
    it('should return chunkNoExist when chunk does not exist', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = await service.checkChunkExist(
        0,
        'testhash',
        1024,
        10,
        'test.dwg'
      );

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });

    it('should handle errors gracefully', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = await service.checkChunkExist(
        0,
        'testhash',
        1024,
        10,
        'test.dwg'
      );

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });
  });

  describe('checkFileExist', () => {
    let mockMinioSyncService: any;

    beforeEach(() => {
      // Mock MinioSyncService
      mockMinioSyncService = {
        fileExists: jest.fn(),
        minioClient: {
          statObject: jest.fn(),
        },
        bucketName: 'test-bucket',
      };
      // 注入 mock 服务
      (service as any).minioSyncService = mockMinioSyncService;
      
      // 清空缓存
      (service as any).fileExistenceCache.clear();
      (service as any).checkingFiles.clear();
    });

    it('should return fileNoExist when file does not exist in MinIO or local', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      mockMinioSyncService.fileExists.mockResolvedValue(false);

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledWith('mxcad/file/testhash.dwg.mxweb');
    });

    it('should return fileAlreadyExist when file exists in MinIO', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      mockMinioSyncService.fileExists.mockResolvedValue(true);

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledWith('mxcad/file/testhash.dwg.mxweb');
    });

    it('should return fileAlreadyExist when file exists in local (MinIO fallback)', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      mockMinioSyncService.fileExists.mockResolvedValue(false);

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledWith('mxcad/file/testhash.dwg.mxweb');
    });

    it('should handle MinIO error and fallback to local', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      mockMinioSyncService.fileExists.mockRejectedValue(new Error('MinIO connection failed'));

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
    });

    it('should use cache for repeated requests', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      mockMinioSyncService.fileExists.mockResolvedValue(true);

      // 第一次请求
      const result1 = await service.checkFileExist('test.dwg', 'testhash');
      expect(result1.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledTimes(1);

      // 第二次请求应该使用缓存
      const result2 = await service.checkFileExist('test.dwg', 'testhash');
      expect(result2.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledTimes(1); // 没有增加
    });

    it('should handle concurrent requests for same file', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      mockMinioSyncService.fileExists.mockImplementation(async () => {
        // 模拟延迟
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      });

      // 同时发起多个请求
      const promises = [
        service.checkFileExist('test.dwg', 'testhash'),
        service.checkFileExist('test.dwg', 'testhash'),
        service.checkFileExist('test.dwg', 'testhash'),
      ];

      const results = await Promise.all(promises);
      
      // 所有请求都应该成功
      results.forEach(result => {
        expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      });
      
      // MinIO 检查应该只执行一次
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledTimes(1);
    });

    it('should handle different file extensions correctly', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      mockMinioSyncService.fileExists.mockResolvedValue(true);

      // 测试 PDF 文件
      const resultPdf = await service.checkFileExist('test.pdf', 'testhash');
      expect(resultPdf.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledWith('mxcad/file/testhash.pdf.pdf');

      // 测试图片文件
      mockMinioSyncService.fileExists.mockClear();
      const resultPng = await service.checkFileExist('test.png', 'testhash');
      expect(resultPng.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockMinioSyncService.fileExists).toHaveBeenCalledWith('mxcad/file/testhash.png.png');
    });
  });

  describe('checkTzStatus', () => {
    it('should return success status', async () => {
      const result = await service.checkTzStatus('testhash');

      expect(result.code).toBe(0);
    });
  });

  describe('convertServerFile', () => {
    it('should handle async conversion', async () => {
      const param = {
        srcpath: '/test/path',
        async: 'true',
        resultposturl: 'http://example.com/callback',
      };

      const result = await service.convertServerFile(param);

      expect(result.code).toBe(0);
      expect(result.message).toBe('async calling');
    });

    it('should handle param error', async () => {
      const result = await service.convertServerFile(null);

      expect(result.code).toBe(12);
      expect(result.message).toBe('param error');
    });
  });

  describe('uploadChunk', () => {
    it('should call mergeConvertFile with correct parameters', async () => {
      jest.spyOn(service, 'mergeConvertFile').mockResolvedValue({ ret: MxUploadReturn.kOk });

      const result = await service.uploadChunk('testhash', 'test.dwg', 1024, 0, 10);

      expect(service.mergeConvertFile).toHaveBeenCalledWith('testhash', 10, 'test.dwg', 1024);
      expect(result.ret).toBe(MxUploadReturn.kOk);
    });
  });

  describe('uploadAndConvertFile', () => {
    it('should successfully upload and convert file', async () => {
      jest.spyOn(service as any, 'convertFile').mockResolvedValue({
        isOk: true,
        ret: { code: 0 },
      });

      const result = await service.uploadAndConvertFile('/tmp/test.dwg', 'testhash', 'test.dwg', 1024);

      expect(result.ret).toBe(MxUploadReturn.kOk);
    });

    it('should return convertFileError when conversion fails', async () => {
      jest.spyOn(service as any, 'convertFile').mockResolvedValue({
        isOk: false,
        ret: { code: -1 },
      });

      const result = await service.uploadAndConvertFile('/tmp/test.dwg', 'testhash', 'test.dwg', 1024);

      expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
    });
  });

  describe('mergeConvertFile', () => {
    it('should return chunkNoExist when temp directory does not exist', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = await service.mergeConvertFile('testhash', 10, 'test.dwg', 1024);

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });

    it('should return ok when chunks are not complete', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readdirSync = jest.fn().mockReturnValue(['0_testhash', '1_testhash']); // 只有2个分片，但期望10个

      const result = await service.mergeConvertFile('testhash', 10, 'test.dwg', 1024);

      expect(result.ret).toBe(MxUploadReturn.kOk);
    });
  });

  describe('convertFile', () => {
    it('should successfully convert file', async () => {
      const fs = require('fs');
      fs.renameSync = jest.fn();

      mockExec.mockImplementation((cmd, callback) => {
        callback(null, '{"code": 0, "message": "success"}', '');
      });

      const result = await (service as any).convertFile('/tmp/test.dwg', 'testhash');

      expect(result.isOk).toBe(true);
      expect(result.ret.code).toBe(0);
    });

    it('should handle conversion errors', async () => {
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Conversion error'), '', '');
      });

      const result = await (service as any).convertFile('/tmp/test.dwg', 'testhash');

      expect(result.isOk).toBe(false);
      expect(result.ret.code).toBe(-1);
    });
  });

  describe('getPreloadingData', () => {
    const fsPromises = require('fs/promises');
    const path = require('path');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('应该成功获取预加载数据', async () => {
      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      // Mock 文件系统操作
      fsPromises.readdir = jest.fn().mockResolvedValue([
        'testhash123.dwg.mxweb',
        'testhash123.dwg.mxweb_preloading.json',
      ]);
      fsPromises.readFile = jest.fn().mockResolvedValue(
        JSON.stringify(mockPreloadingData)
      );
      path.normalize = jest.fn((p) => p);

      const result = await service.getPreloadingData('testhash123');

      expect(result).toEqual(mockPreloadingData);
      expect(fsPromises.readdir).toHaveBeenCalledWith('/tmp/uploads');
      expect(fsPromises.readFile).toHaveBeenCalledWith(
        '/tmp/uploads/testhash123.dwg.mxweb_preloading.json',
        'utf-8'
      );
    });

    it('应该在文件不存在时返回 null', async () => {
      fsPromises.readdir = jest.fn().mockResolvedValue([]);

      const result = await service.getPreloadingData('nonexistent');

      expect(result).toBeNull();
    });

    it('应该在读取失败时返回 null', async () => {
      fsPromises.readdir = jest.fn().mockRejectedValue(new Error('Read error'));

      const result = await service.getPreloadingData('errorhash');

      expect(result).toBeNull();
    });

    it('应该在 JSON 解析失败时返回 null', async () => {
      fsPromises.readdir = jest.fn().mockResolvedValue([
        'testhash123.dwg.mxweb_preloading.json',
      ]);
      fsPromises.readFile = jest.fn().mockResolvedValue('invalid json');

      const result = await service.getPreloadingData('testhash123');

      expect(result).toBeNull();
    });

    it('应该正确处理空的外部参照和图片列表', async () => {
      const mockPreloadingData = {
        tz: true,
        src_file_md5: 'testhash456',
        images: [],
        externalReference: [],
      };

      fsPromises.readdir = jest.fn().mockResolvedValue([
        'testhash456.dxf.mxweb_preloading.json',
      ]);
      fsPromises.readFile = jest.fn().mockResolvedValue(
        JSON.stringify(mockPreloadingData)
      );

      const result = await service.getPreloadingData('testhash456');

      expect(result).toEqual(mockPreloadingData);
      expect(result.images).toHaveLength(0);
      expect(result.externalReference).toHaveLength(0);
    });

    it('应该在哈希格式无效时返回 null', async () => {
      const result = await service.getPreloadingData('invalid-hash');

      expect(result).toBeNull();
    });

    it('应该在检测到路径遍历攻击时返回 null', async () => {
      fsPromises.readdir = jest.fn().mockResolvedValue([
        '../../../etc/passwd_preloading.json',
      ]);
      path.normalize = jest.fn((p) => p);

      const result = await service.getPreloadingData('testhash');

      expect(result).toBeNull();
    });
  });
});