import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import request from 'supertest';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';

describe('MetricsController', () => {
  let app: INestApplication;

  const mockMetricsService = {
    getContentType: jest.fn(),
    getMetrics: jest.fn(),
  };

  const mockPermissionsGuard = {
    canActivate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue(mockPermissionsGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('when user is not authorized', () => {
    it('should reject with 403 and not return metrics', async () => {
      mockPermissionsGuard.canActivate.mockRejectedValue(
        new ForbiddenException('用户未认证'),
      );

      const res = await request(app.getHttpServer()).get('/metrics');

      expect(res.status).toBe(403);
      expect(res.text).not.toContain('http_requests_total');
      expect(mockMetricsService.getMetrics).not.toHaveBeenCalled();
    });
  });

  describe('when user has SYSTEM_MONITOR permission', () => {
    it('should return 200 with metrics content and content-type', async () => {
      mockPermissionsGuard.canActivate.mockResolvedValue(true);

      const res = await request(app.getHttpServer()).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('http_requests_total');
      expect(mockMetricsService.getMetrics).toHaveBeenCalled();
    });
  });
});
