import { Test, TestingModule } from '@nestjs/testing';
import { MxCadService } from './mxcad.service';
import { ConfigService } from '@nestjs/config';
import { MxCadPermissionService } from './mxcad-permission.service';
import { FileUploadManagerService } from './services/file-upload-manager.service';
import { FileSystemNodeService } from './services/filesystem-node.service';
import { FileConversionService } from './services/file-conversion.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';

describe('MxCadService', () => {
  let service: MxCadService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockMxCadPermissionService: jest.Mocked<MxCadPermissionService>;
  let mockFileUploadManager: jest.Mocked<FileUploadManagerService>;
  let mockFileSystemNodeService: jest.Mocked<FileSystemNodeService>;
  let mockFileConversionService: jest.Mocked<FileConversionService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
    } as any;

    mockMxCadPermissionService = {
      validateUploadPermission: jest.fn().mockResolvedValue(undefined),
      validateFileAccessPermission: jest.fn().mockResolvedValue(true),
    } as any;

    mockFileUploadManager = {
      checkChunkExist: jest.fn(),
      checkFileExist: jest.fn(),
      uploadChunk: jest.fn(),
      mergeChunksWithPermission: jest.fn(),
      uploadAndConvertFile: jest.fn(),
      uploadAndConvertFileWithPermission: jest.fn(),
    } as any;

    mockFileSystemNodeService = {
      inferContextForMxCadApp: jest.fn(),
      checkProjectPermission: jest.fn().mockResolvedValue(true),
    } as any;

    mockFileConversionService = {
      convertFile: jest.fn(),
      convertFileAsync: jest.fn().mockResolvedValue('task-123'),
    } as any;

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
          useValue: mockFileUploadManager,
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkChunkExist', () => {
    it('should delegate to fileUploadManager', async () => {
      mockFileUploadManager.checkChunkExist.mockResolvedValue({
        ret: MxUploadReturn.kChunkNoExist,
      });

      const result = await service.checkChunkExist(
        0,
        'testhash',
        1024,
        10,
        'test.dwg'
      );

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
      expect(mockFileUploadManager.checkChunkExist).toHaveBeenCalledWith({
        hash: 'testhash',
        name: 'test.dwg',
        size: 1024,
        chunk: 0,
        chunks: 10,
        context: expect.any(Object),
      });
    });
  });

  describe('checkFileExist', () => {
    it('should delegate to fileUploadManager', async () => {
      mockFileUploadManager.checkFileExist.mockResolvedValue({
        ret: MxUploadReturn.kFileAlreadyExist,
      });

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(mockFileUploadManager.checkFileExist).toHaveBeenCalledWith(
        'test.dwg',
        'testhash',
        expect.any(Object)
      );
    });
  });

  describe('uploadChunk', () => {
    it('should delegate to fileUploadManager', async () => {
      mockFileUploadManager.uploadChunk.mockResolvedValue({
        ret: MxUploadReturn.kOk,
      });

      const result = await service.uploadChunk(
        'testhash',
        'test.dwg',
        1024,
        0,
        10
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(mockFileUploadManager.uploadChunk).toHaveBeenCalledWith({
        hash: 'testhash',
        name: 'test.dwg',
        size: 1024,
        chunk: 0,
        chunks: 10,
        context: expect.any(Object),
      });
    });
  });

  describe('uploadAndConvertFile', () => {
    it('should delegate to fileUploadManager', async () => {
      mockFileUploadManager.uploadAndConvertFile.mockResolvedValue({
        ret: MxUploadReturn.kOk,
      });

      const result = await service.uploadAndConvertFile(
        '/path/to/file.dwg',
        'testhash',
        'test.dwg',
        1024
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(mockFileUploadManager.uploadAndConvertFile).toHaveBeenCalledWith({
        filePath: '/path/to/file.dwg',
        hash: 'testhash',
        name: 'test.dwg',
        size: 1024,
        context: expect.any(Object),
      });
    });
  });

  describe('getPreloadingData', () => {
    it('should return null for invalid file hash', async () => {
      const result = await service.getPreloadingData('invalid-hash');
      expect(result).toBeNull();
    });
  });

  describe('checkExternalReferenceExists', () => {
    it('should return true for existing DWG file', async () => {
      const fs = require('fs/promises');
      fs.access = jest.fn().mockResolvedValue(undefined);

      const result = await service.checkExternalReferenceExists(
        'testhash',
        'ref.dwg'
      );

      expect(result).toBe(true);
    });

    it('should return true for existing image file', async () => {
      const fs = require('fs/promises');
      fs.access = jest.fn().mockResolvedValue(undefined);

      const result = await service.checkExternalReferenceExists(
        'testhash',
        'ref.png'
      );

      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const fs = require('fs/promises');
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.access = jest.fn().mockRejectedValue(error);

      const result = await service.checkExternalReferenceExists(
        'testhash',
        'ref.dwg'
      );

      expect(result).toBe(false);
    });
  });

  describe('inferContextForMxCadApp', () => {
    it('should delegate to fileSystemNodeService', async () => {
      const mockContext = { userId: 'test-user' };
      mockFileSystemNodeService.inferContextForMxCadApp.mockResolvedValue(
        mockContext
      );

      const result = await service.inferContextForMxCadApp(
        'testhash',
        {} as any
      );

      expect(result).toEqual(mockContext);
      expect(
        mockFileSystemNodeService.inferContextForMxCadApp
      ).toHaveBeenCalledWith('testhash', {});
    });
  });

  describe('checkProjectPermission', () => {
    it('should delegate to fileSystemNodeService', async () => {
      const result = await service.checkProjectPermission(
        'project-id',
        'user-id',
        'USER'
      );

      expect(result).toBe(true);
      expect(
        mockFileSystemNodeService.checkProjectPermission
      ).toHaveBeenCalledWith('project-id', 'user-id', 'USER');
    });
  });

  describe('uploadChunkWithPermission', () => {
    it('should validate permission and delegate to fileUploadManager', async () => {
      mockFileUploadManager.uploadChunk.mockResolvedValue({
        ret: MxUploadReturn.kOk,
      });

      const result = await service.uploadChunkWithPermission(
        'testhash',
        'test.dwg',
        1024,
        0,
        10,
        { userId: 'test-user', nodeId: 'node-id' }
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(
        mockMxCadPermissionService.validateUploadPermission
      ).toHaveBeenCalled();
    });
  });

  describe('mergeChunksWithPermission', () => {
    it('should validate permission and delegate to fileUploadManager', async () => {
      mockFileUploadManager.mergeChunksWithPermission.mockResolvedValue({
        ret: MxUploadReturn.kOk,
      });

      const result = await service.mergeChunksWithPermission(
        'testhash',
        'test.dwg',
        1024,
        10,
        { userId: 'test-user', nodeId: 'node-id' }
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(
        mockMxCadPermissionService.validateUploadPermission
      ).toHaveBeenCalled();
    });
  });

  describe('uploadAndConvertFileWithPermission', () => {
    it('should validate permission and delegate to fileUploadManager', async () => {
      mockFileUploadManager.uploadAndConvertFileWithPermission.mockResolvedValue(
        { ret: MxUploadReturn.kOk }
      );

      const result = await service.uploadAndConvertFileWithPermission(
        '/path/to/file.dwg',
        'testhash',
        'test.dwg',
        1024,
        { userId: 'test-user', nodeId: 'node-id' }
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(
        mockMxCadPermissionService.validateUploadPermission
      ).toHaveBeenCalled();
    });
  });

  describe('log methods', () => {
    it('should log error', () => {
      expect(() => service.logError('test error')).not.toThrow();
    });

    it('should log info', () => {
      expect(() => service.logInfo('test info')).not.toThrow();
    });

    it('should log warning', () => {
      expect(() => service.logWarn('test warning')).not.toThrow();
    });
  });
});
