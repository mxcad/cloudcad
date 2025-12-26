import { Test, TestingModule } from '@nestjs/testing';
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';

describe('MxCadController', () => {
  let controller: MxCadController;
  let mockMxCadService: jest.Mocked<MxCadService>;
  let mockResponse: jest.Mocked<Response>;

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
      checkProjectPermission: jest.fn(),
    } as any;

    const mockDatabaseService = {
      user: {
        findUnique: jest.fn(),
      },
      fileAccess: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockJwtService = {
      verify: jest.fn(),
    } as any;

    mockResponse = {
      json: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn(),
      redirect: jest.fn(),
    } as any;

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
      ],
    }).compile();

    controller = module.get<MxCadController>(MxCadController);
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
        fileName: 'test.dwg',
      };

      mockMxCadService.checkChunkExist.mockResolvedValue({
        ret: MxUploadReturn.kChunkNoExist,
      });

      await controller.checkChunkExist(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: MxUploadReturn.kChunkNoExist,
      });
      expect(mockMxCadService.checkChunkExist).toHaveBeenCalledWith(
        dto.chunk,
        dto.fileHash,
        dto.size,
        dto.chunks,
        dto.fileName
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

      await controller.checkFileExist(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        ret: MxUploadReturn.kFileNoExist,
      });
      expect(mockMxCadService.checkFileExist).toHaveBeenCalledWith(
        dto.filename,
        dto.fileHash
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
      await controller.uploadFile(undefined, {}, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'errorparam' });
    });

    it('should return errorparam when required fields are missing', async () => {
      const mockFile = { path: '/tmp/test', originalname: 'test.dwg' } as any;

      await controller.uploadFile(mockFile, {}, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'errorparam' });
    });

    it('should handle full file upload successfully', async () => {
      const mockFile = { path: '/tmp/test', originalname: 'test.dwg' } as any;
      const body = { hash: 'testhash', name: 'test.dwg', size: 1024 };

      mockMxCadService.uploadAndConvertFile.mockResolvedValue({ ret: MxUploadReturn.kOk });

      await controller.uploadFile(mockFile, body, mockResponse);

      expect(mockMxCadService.uploadAndConvertFile).toHaveBeenCalledWith(
        '/tmp/test',
        'testhash',
        'test.dwg',
        1024
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ ret: MxUploadReturn.kOk });
    });
  });

  describe('testUploadFile', () => {
    it('should return ok for successful test upload', async () => {
      const mockFile = { path: '/tmp/test', originalname: 'test.dwg' } as any;

      await controller.testUploadFile(mockFile, mockResponse);

      expect(mockResponse.send).toHaveBeenCalledWith('ok');
    });

    it('should return errorparam when file is missing', async () => {
      await controller.testUploadFile(undefined, mockResponse);

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

      expect(mockResponse.json).toHaveBeenCalledWith({ code: 0, message: 'success' });
      expect(mockMxCadService.convertServerFile).toHaveBeenCalledWith(dto.param);
    });

    it('should handle JSON parse error', async () => {
      const dto = {
        param: 'invalid json',
      };

      await controller.convertServerFile(dto, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: 12, message: 'param error' });
    });
  });

  describe('uploadAndConvert', () => {
    it('should return error when file is missing', async () => {
      await controller.uploadAndConvert(undefined, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
    });
  });

  describe('saveMxweb', () => {
    it('should save mxweb file successfully', async () => {
      const mockFile = { filename: 'test.mxweb' } as any;

      await controller.saveMxweb(mockFile, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.mxweb',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.saveMxweb(undefined, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
    });
  });

  describe('saveDwg', () => {
    it('should save dwg file successfully', async () => {
      const mockFile = { path: '/tmp/test', filename: 'test', originalname: 'test.dwg' } as any;

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.saveDwg(mockFile, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        code: 0,
        file: 'test.dwg',
        ret: 'ok',
      });
    });

    it('should return error when file is missing', async () => {
      await controller.saveDwg(undefined, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'failed', code: -1, message: '缺少文件' });
    });
  });

  describe('savePdf', () => {
    it('should save pdf file successfully', async () => {
      const mockFile = { path: '/tmp/test', filename: 'test', originalname: 'test.pdf' } as any;
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
      await controller.savePdf(undefined, {}, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'failed', code: -1, message: '缺少文件' });
    });
  });

  describe('printToPdf', () => {
    it('should print to pdf successfully', async () => {
      const mockFile = { path: '/tmp/test', filename: 'test', originalname: 'test.pdf' } as any;
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
      await controller.printToPdf(undefined, { param: '{}' }, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'failed', code: -1, message: '缺少文件' });
    });
  });

  describe('cutDwg', () => {
    it('should cut dwg successfully', async () => {
      const mockFile = { path: '/tmp/test', filename: 'test', originalname: 'test.dwg' } as any;
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
      await controller.cutDwg(undefined, { param: '{}' }, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'failed', code: -1, message: '缺少文件' });
    });
  });

  describe('cutMxweb', () => {
    it('should cut mxweb successfully', async () => {
      const mockFile = { path: '/tmp/test', filename: 'test', originalname: 'test.mxweb' } as any;
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
      await controller.cutMxweb(undefined, { param: '{}' }, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ ret: 'failed', code: -1, message: '缺少文件' });
    });
  });

  describe('uploadExtReferenceDwg', () => {
    it('should upload external reference dwg successfully', async () => {
      const mockFile = { path: '/tmp/test', originalname: 'ref.dwg' } as any;
      const body = { src_dwgfile_hash: 'testhash', ext_ref_file: 'ref' };

      mockMxCadService.convertServerFile.mockResolvedValue({ code: 0 });

      await controller.uploadExtReferenceDwg(mockFile, body, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: 0 });
    });

    it('should return error when file is missing', async () => {
      await controller.uploadExtReferenceDwg(undefined, { src_dwgfile_hash: 'test', ext_ref_file: 'ref' }, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
    });
  });

  describe('uploadExtReferenceImage', () => {
    it('should return error when file is missing', async () => {
      await controller.uploadExtReferenceImage(undefined, { src_dwgfile_hash: 'test', ext_ref_file: 'ref' }, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
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

      expect(mockResponse.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
    });
  });

  describe('getFile', () => {
    it('should return 404 when file does not exist', async () => {
      const filename = 'nonexistent.dwg.mxweb';
      
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      await controller.getFile(filename, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        code: -1,
        message: '文件不存在',
      });
    });
  });
});