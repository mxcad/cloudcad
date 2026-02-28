import { Test, TestingModule } from '@nestjs/testing';
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { UploadFilesDto } from './dto/upload-files.dto';

describe('MxCadController', () => {
  let controller: MxCadController;
  let mockMxCadService: jest.Mocked<MxCadService>;
  let mockResponse: jest.Mocked<Response>;
  let mockRequest: any;

  beforeEach(async () => {
    mockMxCadService = {
      checkChunkExist: jest.fn(),
      checkFileExist: jest.fn(),
      checkTzStatus: jest.fn(),
      uploadChunk: jest.fn(),
      uploadAndConvertFile: jest.fn(),
      convertServerFile: jest.fn(),
      logError: jest.fn(),
      logInfo: jest.fn(),
      logWarn: jest.fn(),
      getPreloadingData: jest.fn(),
      checkExternalReferenceExists: jest.fn(),
    } as any;

    const mockDatabaseService = {
      user: {
        findUnique: jest.fn(),
      },
      fileAccess: {
        findUnique: jest.fn(),
      },
      fileSystemNode: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    } as any;

    const mockJwtService = {
      verify: jest.fn(),
    } as any;

    const mockConfigService = {
      get: jest.fn(),
    } as any;

    mockResponse = {
      json: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn(),
      redirect: jest.fn(),
    } as any;

    mockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        nodeId: 'node123',
      },
      query: {
        nodeId: 'node123',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MxCadController],
      providers: [
        {
          provide: MxCadService,
          useValue: mockMxCadService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<MxCadController>(MxCadController);

    // Mock JWT verify to return a valid payload
    mockJwtService.verify = jest.fn().mockReturnValue({
      sub: 'user123',
      email: 'test@example.com',
    });

    // Mock user findUnique to return a valid user
    mockDatabaseService.user.findUnique = jest.fn().mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      status: 'ACTIVE',
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkChunkExist', () => {
    it('should return chunk existence status', async () => {
      const dto = {
        chunk: 0,
        fileHash: 'testhash',
        size: 1024,
        chunks: 10,
        filename: 'test.dwg',
      };

      mockMxCadService.checkChunkExist.mockResolvedValue({
        ret: MxUploadReturn.kChunkNoExist,
      });

      await controller.checkChunkExist(dto, mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: MxUploadReturn.kChunkNoExist,
      });
      expect(mockMxCadService.checkChunkExist).toHaveBeenCalledWith(
        dto.chunk,
        dto.fileHash,
        dto.size,
        dto.chunks,
        dto.filename,
        expect.objectContaining({
          nodeId: 'node123',
          userId: 'user123',
        })
      );
    });
  });

  describe('checkFileExist', () => {
    it('should return file existence status', async () => {
      const dto = {
        filename: 'test.dwg',
        fileHash: 'testhash',
      };

      mockMxCadService.checkFileExist.mockResolvedValue({
        ret: MxUploadReturn.kFileNoExist,
      });

      await controller.checkFileExist(dto, mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: MxUploadReturn.kFileNoExist,
      });
      expect(mockMxCadService.checkFileExist).toHaveBeenCalledWith(
        dto.filename,
        dto.fileHash,
        expect.objectContaining({
          nodeId: 'node123',
          userId: 'user123',
        })
      );
    });
  });

  describe('checkTzStatus', () => {
    it('should return tz status', async () => {
      const dto = {
        fileHash: 'testhash',
      };

      mockMxCadService.checkTzStatus.mockResolvedValue({ code: 0 });

      await controller.checkTzStatus(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: 0 });
      expect(mockMxCadService.checkTzStatus).toHaveBeenCalledWith(dto.fileHash);
    });
  });

  describe('uploadFile', () => {
    it('should return errorparam when file is missing', async () => {
      await controller.uploadFile(
        undefined as unknown as Express.Multer.File[],
        {} as UploadFilesDto,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'errorparam' });
    });

    it('should return errorparam when required fields are missing', async () => {
      const mockFile = [
        { path: '/tmp/test', originalname: 'test.dwg' },
      ] as Express.Multer.File[];

      await controller.uploadFile(
        mockFile,
        {} as UploadFilesDto,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'errorparam' });
    });

    it('should handle full file upload successfully', async () => {
      const mockFile = [
        { path: '/tmp/test', originalname: 'test.dwg', size: 1024 },
      ] as Express.Multer.File[];
      const body = { hash: 'testhash', name: 'test.dwg', size: 1024 };

      mockMxCadService.uploadAndConvertFileWithPermission = jest
        .fn()
        .mockResolvedValue({ ret: MxUploadReturn.kOk });

      await controller.uploadFile(mockFile, body, mockRequest, mockResponse);

      expect(
        mockMxCadService.uploadAndConvertFileWithPermission
      ).toHaveBeenCalledWith(
        '/tmp/test',
        'testhash',
        'test.dwg',
        1024,
        expect.objectContaining({
          nodeId: 'node123',
          userId: 'user123',
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: MxUploadReturn.kOk,
      });
    });
  });

  describe('testUploadFile', () => {
    it('should return ok for successful test upload', async () => {
      const mockFile = {
        path: '/tmp/test',
        originalname: 'test.dwg',
      } as Express.Multer.File;

      await controller.testUploadFile(mockFile, mockResponse);

      expect(mockResponse.send).toHaveBeenCalledWith('ok');
    });

    it('should return errorparam when file is missing', async () => {
      await controller.testUploadFile(
        undefined as unknown as Express.Multer.File,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'errorparam' });
    });
  });

  describe('convertServerFile', () => {
    it('should convert server file with object param', async () => {
      const dto = {
        param: {
          srcpath: '/test/path',
        },
      };

      mockMxCadService.convertServerFile.mockResolvedValue({
        code: 0,
        message: 'success',
      });

      await controller.convertServerFile(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        message: 'success',
      });
      expect(mockMxCadService.convertServerFile).toHaveBeenCalledWith(
        dto.param
      );
    });

    it('should handle JSON parse error', async () => {
      const dto = {
        param: 'invalid json',
      };

      await controller.convertServerFile(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 12,
        message: 'param error',
      });
    });
  });

  describe('uploadAndConvert', () => {
    it('should return error when file is missing', async () => {
      await controller.uploadAndConvert(
        undefined as unknown as Express.Multer.File,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('saveMxweb', () => {
    it('should save mxweb file successfully', async () => {
      const mockFile = { filename: 'test.mxweb' } as Express.Multer.File;

      await controller.saveMxweb(mockFile, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.mxweb',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.saveMxweb(
        undefined as unknown as Express.Multer.File,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('saveDwg', () => {
    it('should save dwg file successfully', async () => {
      const mockFile = {
        path: '/tmp/test',
        filename: 'test',
        originalname: 'test.dwg',
      } as Express.Multer.File;

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.saveDwg(mockFile, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.dwg',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.saveDwg(
        undefined as unknown as Express.Multer.File,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: 'failed',
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('savePdf', () => {
    it('should save pdf file successfully', async () => {
      const mockFile = {
        path: '/tmp/test',
        filename: 'test',
        originalname: 'test.pdf',
      } as Express.Multer.File;
      const body = { param: '{"width": "3000", "height": "3000"}' };

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.savePdf(mockFile, body, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.pdf',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.savePdf(
        undefined as unknown as Express.Multer.File,
        {},
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: 'failed',
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('printToPdf', () => {
    it('should print to pdf successfully', async () => {
      const mockFile = {
        path: '/tmp/test',
        filename: 'test',
        originalname: 'test.pdf',
      } as Express.Multer.File;
      const body = { param: '{"width": "3000"}' };

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.printToPdf(mockFile, body, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.pdf',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.printToPdf(
        undefined as unknown as Express.Multer.File,
        { param: '{}' },
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: 'failed',
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('cutDwg', () => {
    it('should cut dwg successfully', async () => {
      const mockFile = {
        path: '/tmp/test',
        filename: 'test',
        originalname: 'test.dwg',
      } as Express.Multer.File;
      const body = { param: '{"some": "param"}' };

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.cutDwg(mockFile, body, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.dwg',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.cutDwg(
        undefined as unknown as Express.Multer.File,
        { param: '{}' },
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: 'failed',
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('cutMxweb', () => {
    it('should cut mxweb successfully', async () => {
      const mockFile = {
        path: '/tmp/test',
        filename: 'test',
        originalname: 'test.mxweb',
      } as Express.Multer.File;
      const body = { param: '{"some": "param"}' };

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.cutMxweb(mockFile, body, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.mxweb',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.cutMxweb(
        undefined as unknown as Express.Multer.File,
        { param: '{}' },
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: 'failed',
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe.skip('uploadExtReferenceDwg', () => {
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
      };
    });

    it('应该成功上传有效的外部参照 DWG', async () => {
      const mockFile = {
        path: '/tmp/test.dwg',
        originalname: 'ref1.dwg',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.dwg',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: [],
        externalReference: ['ref1.dwg'],
      };

      const mockConvertResult = { code: 0, message: 'ok' };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);
      mockMxCadService.convertServerFile = jest
        .fn()
        .mockResolvedValue(mockConvertResult);

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();

      await controller.uploadExtReferenceDwg(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockMxCadService.getPreloadingData).toHaveBeenCalledWith(
        'testhash123'
      );
      expect(mockMxCadService.convertServerFile).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(mockConvertResult);
    });

    it('应该在缺少文件时返回错误', async () => {
      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.dwg',
      };

      await controller.uploadExtReferenceDwg(
        null,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });

    it('应该在缺少必要参数时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.dwg',
        originalname: 'ref1.dwg',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: '',
        ext_ref_file: '',
      };

      await controller.uploadExtReferenceDwg(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少必要参数',
      });
    });

    it('应该在图纸不存在时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.dwg',
        originalname: 'ref1.dwg',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'nonexistent',
        ext_ref_file: 'ref1.dwg',
      };

      mockMxCadService.getPreloadingData = jest.fn().mockResolvedValue(null);

      await controller.uploadExtReferenceDwg(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockMxCadService.getPreloadingData).toHaveBeenCalledWith(
        'nonexistent'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '图纸文件不存在',
      });
    });

    it('应该拒绝无效的外部参照文件', async () => {
      const mockFile = {
        path: '/tmp/test.dwg',
        originalname: 'invalid.dwg',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'invalid.dwg',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: [],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);

      await controller.uploadExtReferenceDwg(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '无效的外部参照文件',
      });
    });

    it('应该在转换失败时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.dwg',
        originalname: 'ref1.dwg',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.dwg',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: [],
        externalReference: ['ref1.dwg'],
      };

      const mockConvertResult = { code: -1, message: '转换失败' };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);
      mockMxCadService.convertServerFile = jest
        .fn()
        .mockResolvedValue(mockConvertResult);

      await controller.uploadExtReferenceDwg(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '转换失败',
      });
    });
  });

  describe.skip('uploadExtReferenceImage', () => {
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
      };
    });

    it('应该成功上传有效的外部参照图片', async () => {
      const mockFile = {
        path: '/tmp/test.png',
        originalname: 'ref1.png',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.png',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['ref1.png'],
        externalReference: [],
      };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();

      await controller.uploadExtReferenceImage(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockMxCadService.getPreloadingData).toHaveBeenCalledWith(
        'testhash123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        message: 'ok',
      });
    });

    it('应该在缺少文件时返回错误', async () => {
      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.png',
      };

      await controller.uploadExtReferenceImage(
        null,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });

    it('应该在缺少必要参数时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.png',
        originalname: 'ref1.png',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: '',
        ext_ref_file: '',
      };

      await controller.uploadExtReferenceImage(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少必要参数',
      });
    });

    it('应该在图纸不存在时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.png',
        originalname: 'ref1.png',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'nonexistent',
        ext_ref_file: 'ref1.png',
      };

      mockMxCadService.getPreloadingData = jest.fn().mockResolvedValue(null);

      await controller.uploadExtReferenceImage(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockMxCadService.getPreloadingData).toHaveBeenCalledWith(
        'nonexistent'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '图纸文件不存在',
      });
    });

    it('应该拒绝无效的外部参照文件', async () => {
      const mockFile = {
        path: '/tmp/test.png',
        originalname: 'invalid.png',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'invalid.png',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['ref1.png', 'ref2.png'],
        externalReference: [],
      };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);

      await controller.uploadExtReferenceImage(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '无效的外部参照文件',
      });
    });

    it('应该在文件复制失败时返回错误', async () => {
      const mockFile = {
        path: '/tmp/test.png',
        originalname: 'ref1.png',
        size: 1024,
      } as Express.Multer.File;

      const mockBody = {
        nodeId: 'testhash123',
        ext_ref_file: 'ref1.png',
      };

      const mockPreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['ref1.png'],
        externalReference: [],
      };

      mockMxCadService.getPreloadingData = jest
        .fn()
        .mockResolvedValue(mockPreloadingData);

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn().mockImplementation(() => {
        throw new Error('复制失败');
      });

      await controller.uploadExtReferenceImage(
        mockFile,
        mockBody,
        mockRequest,
        mockResponse
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '文件复制失败',
      });
    });
  });

  describe('uploadImage', () => {
    it('should upload image successfully', async () => {
      const mockFile = { filename: 'test.png' } as any;

      await controller.uploadImage(mockFile, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        message: 'ok',
        file: 'test.png',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.uploadImage(undefined, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });
  });

  describe('getFile', () => {
    it('should return 404 when file does not exist', async () => {
      const filename = 'nonexistent.dwg.mxweb';

      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      await controller.getFile(filename, mockResponse, mockRequest);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '文件不存在',
      });
    });
  });
});
