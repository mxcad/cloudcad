import { Test, type TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { AlertLevel, AlertStatus } from './enums/alert.enum';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

// AlertController 经全局单例 getAuditLoggerInstance() 写审计（避免模块环），mock 该单例
const mockAuditLogger = { audit: jest.fn().mockResolvedValue(undefined) };
jest.mock('../audit/audit-logger.service', () => ({
  getAuditLoggerInstance: () => mockAuditLogger,
}));

describe('AlertController', () => {
  let controller: AlertController;
  let mockAlertService: {
    findAll: jest.Mock;
    resolveById: jest.Mock;
  };

  const mockRecord = {
    id: 'alert-1',
    source: 'disk-monitor',
    messageKey: 'disk_space_low',
    level: AlertLevel.P1,
    message: '磁盘剩余空间不足',
    detail: { free: '12.3GB' },
    status: AlertStatus.OPEN,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAlertService = {
      findAll: jest.fn(),
      resolveById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertController],
      providers: [{ provide: AlertService, useValue: mockAlertService }],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<AlertController>(AlertController);
  });

  describe('permission metadata', () => {
    it('should require SYSTEM_MONITOR at class level', () => {
      const reflector = new Reflector();
      const permissions = reflector.getAllAndOverride<SystemPermission[]>(
        PERMISSIONS_KEY,
        [AlertController.prototype.list, AlertController]
      );
      expect(permissions).toEqual([SystemPermission.SYSTEM_MONITOR]);
    });
  });

  describe('list', () => {
    it('should delegate query filters and pagination to service', async () => {
      const result = {
        data: [mockRecord],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockAlertService.findAll.mockResolvedValue(result);

      const response = await controller.list({
        page: 2,
        limit: 10,
        level: AlertLevel.P0,
        status: AlertStatus.OPEN,
        source: 'disk-monitor',
      });

      expect(mockAlertService.findAll).toHaveBeenCalledWith(
        {
          level: AlertLevel.P0,
          status: AlertStatus.OPEN,
          source: 'disk-monitor',
        },
        { page: 2, limit: 10 }
      );
      expect(response).toEqual(result);
    });

    it('should default page to 1 and limit to 20 when omitted', async () => {
      mockAlertService.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await controller.list({});

      expect(mockAlertService.findAll).toHaveBeenCalledWith(
        { level: undefined, status: undefined, source: undefined },
        { page: 1, limit: 20 }
      );
    });
  });

  describe('resolve', () => {
    it('should resolve by id and return updated record', async () => {
      const resolved = {
        ...mockRecord,
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      };
      mockAlertService.resolveById.mockResolvedValue(resolved);

      const result = await controller.resolve('alert-1', {
        user: { id: 'user-1' },
      } as never);

      expect(mockAlertService.resolveById).toHaveBeenCalledWith('alert-1');
      expect(result).toEqual(resolved);
      // 安全审计：解决告警（真实写入 audit_logs）
      expect(mockAuditLogger.audit).toHaveBeenCalledWith({
        action: AuditAction.ALERT_RESOLVE,
        resourceType: ResourceType.ALERT,
        resourceId: 'alert-1',
        userId: 'user-1',
        success: true,
      });
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      mockAlertService.resolveById.mockResolvedValue(null);

      await expect(
        controller.resolve('missing', {
          user: { id: 'user-1' },
        } as never)
      ).rejects.toThrow(NotFoundException);
      expect(mockAlertService.resolveById).toHaveBeenCalledWith('missing');
    });
  });

  describe('list validation pipe', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertController],
        providers: [{ provide: AlertService, useValue: mockAlertService }],
      })
        .overrideGuard(PermissionsGuard)
        .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
        .compile();

      app = module.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ transform: true }));
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('should reject limit > 100 with 400', async () => {
      const res = await request(app.getHttpServer()).get('/alert?limit=101');

      expect(res.status).toBe(400);
      expect(mockAlertService.findAll).not.toHaveBeenCalled();
    });

    it('should reject non-numeric page with 400', async () => {
      const res = await request(app.getHttpServer()).get('/alert?page=abc');

      expect(res.status).toBe(400);
      expect(mockAlertService.findAll).not.toHaveBeenCalled();
    });

    it('should accept limit=100 and transform query to numbers', async () => {
      mockAlertService.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      const res = await request(app.getHttpServer()).get('/alert?limit=100');

      expect(res.status).toBe(200);
      expect(mockAlertService.findAll).toHaveBeenCalledWith(
        { level: undefined, status: undefined, source: undefined },
        { page: 1, limit: 100 }
      );
    });
  });
});
