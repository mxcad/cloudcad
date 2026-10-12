import { Test, type TestingModule } from '@nestjs/testing';
import { ThumbnailController } from './thumbnail.controller';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { JwtStrategyExecutor } from '../../auth/jwt.strategy.executor';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
describe('ThumbnailController', () => {
  let controller: ThumbnailController;

  const mockThumbnailGenerationService = {
    checkThumbnailExists: jest.fn(),
    saveThumbnail: jest.fn(),
  };

  const mockReq = {
    headers: {},
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThumbnailController],
      providers: [
        { provide: ThumbnailGenerationService, useValue: mockThumbnailGenerationService },
      ],
    })
      .overrideGuard(JwtStrategyExecutor)
      .useValue({ canActivate: () => true })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThumbnailController>(ThumbnailController);
  });

  describe('checkThumbnail', () => {
    it('should return exists=true when thumbnail exists', async () => {
      mockThumbnailGenerationService.checkThumbnailExists.mockResolvedValue({ exists: true });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      } as any;

      await controller.checkThumbnail('node-1', mockReq as any, res);

      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        message: 'ok',
        exists: true,
      });
    });

    it('should return 404 when node not found', async () => {
      mockThumbnailGenerationService.checkThumbnailExists.mockResolvedValue({
        exists: false,
        location: 'none',
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      } as any;

      await controller.checkThumbnail('missing', mockReq as any, res);

      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        message: 'ok',
        exists: false,
      });
    });

    it('should return 500 on error', async () => {
      mockThumbnailGenerationService.checkThumbnailExists.mockRejectedValue(
        new Error('db error'),
      );

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      } as any;

      await controller.checkThumbnail('node-1', mockReq as any, res);

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

    it('should return 200 with fileName when saveThumbnail succeeds', async () => {
      mockThumbnailGenerationService.saveThumbnail.mockResolvedValue({
        success: true,
        fileName: 'thumbnail.jpg',
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.uploadThumbnail(
        'node-1',
        {
          buffer: Buffer.from('fake-jpg'),
          mimetype: 'image/jpeg',
          originalname: 'blob',
        } as any,
        res,
      );

      expect(mockThumbnailGenerationService.saveThumbnail).toHaveBeenCalledWith(
        'node-1',
        expect.any(Buffer),
      );
      expect(res.json).toHaveBeenCalledWith({
        code: 0,
        message: '缩略图上传成功',
        data: { fileName: 'thumbnail.jpg' },
      });
    });

    it('should return 404 when node not found', async () => {
      mockThumbnailGenerationService.saveThumbnail.mockResolvedValue({
        success: false,
        notFound: true,
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.uploadThumbnail(
        'missing',
        {
          buffer: Buffer.from('fake-jpg'),
          mimetype: 'image/jpeg',
          originalname: 'blob',
        } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 and not call saveThumbnail when mimetype is not jpg', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.uploadThumbnail(
        'node-1',
        {
          buffer: Buffer.from('fake-png'),
          mimetype: 'image/png',
          originalname: 'blob',
        } as any,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockThumbnailGenerationService.saveThumbnail).not.toHaveBeenCalled();
    });
  });
});
