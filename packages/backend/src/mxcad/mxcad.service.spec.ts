import { Test, TestingModule } from '@nestjs/testing';
import { MxCadService } from './mxcad.service';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from './enums/mxcad-return.enum';

describe('MxCadService', () => {
  let service: MxCadService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkChunkExist', () => {
    it('should return chunkNoExist when chunk does not exist', async () => {
      // 模拟配置
      mockConfigService.get.mockReturnValue('/tmp/test');

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
      // 模拟配置返回 null 导致错误
      mockConfigService.get.mockReturnValue(null);

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
      mockConfigService.get.mockReturnValue('/tmp/test');

      const result = await service.checkFileExist('test.dwg', 'testhash');

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
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
});