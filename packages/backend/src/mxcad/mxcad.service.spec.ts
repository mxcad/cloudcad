import { Test, TestingModule } from '@nestjs/testing';
import { MxCadService } from './mxcad.service';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from './enums/mxcad-return.enum';

// Mock fs 模块
jest.mock('fs');
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
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
    it('should return fileNoExist when file does not exist', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
    });

    it('should return fileAlreadyExist when file exists', async () => {
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
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
      expect(result.message).toBe('aysnc calling');
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
});