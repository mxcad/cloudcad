import { Test, type TestingModule } from '@nestjs/testing';
import { ThumbnailController } from './thumbnail.controller';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { ConfigService } from '@nestjs/config';
import { JwtStrategyExecutor } from '../../auth/jwt.strategy.executor';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
describe('ThumbnailController', () => {
  let controller: ThumbnailController;

  const mockThumbnailGenerationService = {
    checkThumbnailExists: jest.fn(),
  };

  const mockFileSystemNodeService = {
    findById: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'filesDataPath') return '/fake/filesData';
      return undefined;
    }),
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
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: ConfigService, useValue: mockConfigService },
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
  });
});
