import { Test, TestingModule } from '@nestjs/testing';
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MxUploadReturn } from './enums/mxcad-return.enum';

describe('MxCadController', () => {
  let controller: MxCadController;
  let mockMxCadService: jest.Mocked<MxCadService>;

  beforeEach(async () => {
    mockMxCadService = {
      checkChunkExist: jest.fn(),
      checkFileExist: jest.fn(),
      checkTzStatus: jest.fn(),
      uploadChunk: jest.fn(),
      uploadAndConvertFile: jest.fn(),
      convertServerFile: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MxCadController],
      providers: [
        {
          provide: MxCadService,
          useValue: mockMxCadService,
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

      const result = await controller.checkChunkExist(dto);

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
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

      const result = await controller.checkFileExist(dto);

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
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

      const result = await controller.checkTzStatus(dto);

      expect(result.code).toBe(0);
      expect(mockMxCadService.checkTzStatus).toHaveBeenCalledWith(dto.fileHash);
    });
  });

  describe('convertServerFile', () => {
    it('should convert server file', async () => {
      const dto = {
        param: {
          srcpath: '/test/path',
        },
      };

      mockMxCadService.convertServerFile.mockResolvedValue({
        code: 0,
        message: 'success',
      });

      const result = await controller.convertServerFile(dto);

      expect(result.code).toBe(0);
      expect(mockMxCadService.convertServerFile).toHaveBeenCalledWith(dto.param);
    });

    it('should handle string param', async () => {
      const dto = {
        param: '{"srcpath": "/test/path"}',
      };

      mockMxCadService.convertServerFile.mockResolvedValue({
        code: 0,
        message: 'success',
      });

      const result = await controller.convertServerFile(dto);

      expect(result.code).toBe(0);
      expect(mockMxCadService.convertServerFile).toHaveBeenCalledWith(
        JSON.parse(dto.param)
      );
    });
  });
});