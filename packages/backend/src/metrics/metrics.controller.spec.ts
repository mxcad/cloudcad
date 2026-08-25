import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import type { Express } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';
import { IPERMISSION_SERVICE } from '../permission/interfaces/permission-service.interface';
import { SystemPermission } from '../common/enums/permissions.enum';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { SCRAPE_AUTH_KEY } from '../auth/decorators/scrape-auth.decorator';

describe('MetricsController', () => {
  let app: INestApplication;

  const mockMetricsService = {
    getContentType: jest.fn(),
    getMetrics: jest.fn(),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn(),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // jest 配置含 resetMocks，外部定义的 mock 实现会被清空，需在 beforeEach 重设
    reflectorMock.getAllAndOverride.mockImplementation((key: string) =>
      key === PERMISSIONS_KEY ? [SystemPermission.SYSTEM_MONITOR] : undefined,
    );

    mockMetricsService.getContentType.mockReturnValue(
      'text/plain; version=0.0.4; charset=utf-8',
    );
    mockMetricsService.getMetrics.mockResolvedValue(
      '# HELP http_requests_total Total number of HTTP requests',
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: Reflector, useValue: reflectorMock },
        { provide: IPERMISSION_SERVICE, useValue: mockPermissionService },
      ],
    }).compile();

    app = module.createNestApplication();

    // 模拟 JwtStrategyExecutor 抓取令牌认证成功后的标记（#315）
    // 以及已登录用户（request.user）注入，避免引入 passport 全链路
    (app as unknown as Express).use((req: any, _res: any, next: () => void) => {
      if (req.headers['x-test-scrape'] === '1') {
        req.isScrapeAuth = true;
      }
      if (req.headers['x-test-user'] === '1') {
        req.user = { id: 'user-1' };
      }
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('metadata', () => {
    it('should require SYSTEM_MONITOR at class level as fallback', () => {
      const reflector = new Reflector();
      const permissions = reflector.getAllAndOverride<SystemPermission[]>(
        PERMISSIONS_KEY,
        [MetricsController.prototype.getMetrics, MetricsController],
      );
      expect(permissions).toEqual([SystemPermission.SYSTEM_MONITOR]);
    });

    it('should declare @ScrapeAuth for scrape token auth', () => {
      const reflector = new Reflector();
      expect(
        reflector.getAllAndOverride<boolean>(SCRAPE_AUTH_KEY, [
          MetricsController.prototype.getMetrics,
          MetricsController,
        ]),
      ).toBe(true);
    });
  });

  describe('when scrape token auth passed (#315)', () => {
    it('should bypass SYSTEM_MONITOR permission and return metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/metrics')
        .set('x-test-scrape', '1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('http_requests_total');
      expect(mockPermissionService.checkSystemPermission).not.toHaveBeenCalled();
    });
  });

  describe('when user is not authorized', () => {
    it('should reject with 403 and not return metrics', async () => {
      const res = await request(app.getHttpServer()).get('/metrics');

      expect(res.status).toBe(403);
      expect(res.text).not.toContain('http_requests_total');
      expect(mockMetricsService.getMetrics).not.toHaveBeenCalled();
    });
  });

  describe('when user has SYSTEM_MONITOR permission', () => {
    it('should return 200 with metrics content and content-type', async () => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .get('/metrics')
        .set('x-test-user', '1');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('http_requests_total');
      expect(mockPermissionService.checkSystemPermission).toHaveBeenCalledWith(
        'user-1',
        SystemPermission.SYSTEM_MONITOR,
      );
    });
  });

  describe('when user lacks permission', () => {
    it('should reject with 403', async () => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .get('/metrics')
        .set('x-test-user', '1');

      expect(res.status).toBe(403);
      expect(mockMetricsService.getMetrics).not.toHaveBeenCalled();
    });
  });
});
