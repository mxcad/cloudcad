import { Test, type TestingModule } from '@nestjs/testing';
import { ThumbnailController } from './thumbnail.controller';
import { MxCadService } from '../core/mxcad.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('ThumbnailController', () => {
  let controller: ThumbnailController;

  const mockMxCadService = {
    getFileSystemNodeByNodeId: jest.fn(),
    checkThumbnailExists: jest.fn(),
    uploadThumbnail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'filesDataPath') return '/fake/filesData';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThumbnailController],
      providers: [
        { provide: MxCadService, useValue: mockMxCadService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThumbnailController>(ThumbnailController);
  });

  describe('checkThumbnail', () => {
    it('should return exists=true when thumbnail exists', async () => {
      mockMxCadService.getFileSystemNodeByNodeId.mockResolvedValue({
        id: 'node-1',
        path: 'project/file.dwg',
      });
      mockMxCadService.checkThumbnailExists.mockResolvedValue({ exists: true });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.checkThumbnail('node-1', res);

      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        message: 'ok',
        exists: true,
      });
    });

    it('should return 404 when node not found', async () => {
      mockMxCadService.getFileSystemNodeByNodeId.mockResolvedValue(null);

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.checkThumbnail('missing', res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 when node has no path', async () => {
      mockMxCadService.getFileSystemNodeByNodeId.mockResolvedValue({
        id: 'node-1',
        path: null,
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.checkThumbnail('node-1', res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on error', async () => {
      mockMxCadService.getFileSystemNodeByNodeId.mockRejectedValue(
        new Error('db error'),
      );

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.checkThumbnail('node-1', res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('uploadThumbnail', () => {
    it('should return 400 when no file uploaded', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.uploadThumbnail('node-1', null, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        message: '缺少文件',
      });
    });

    it('should return 500 when uploaded file does not exist on disk', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.uploadThumbnail(
        'node-1',
        { path: '/tmp/thumb.png', originalname: 'thumb.png' } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: -1,
        message: '上传的文件不存在',
      });
    });
  });
});
