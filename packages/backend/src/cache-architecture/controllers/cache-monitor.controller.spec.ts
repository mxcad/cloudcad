///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ForbiddenException,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { CacheMonitorController } from './cache-monitor.controller';
import { CacheMonitorService } from '../services/cache-monitor.service';
import { MultiLevelCacheService } from '../services/multi-level-cache.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  IPERMISSION_SERVICE,
  type IPermissionService,
} from '../../permission/interfaces/permission-service.interface';
import {
  PERMISSIONS_KEY,
  type PermissionCheckMode,
} from '../../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../../common/enums/permissions.enum';

describe('CacheMonitorController', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const mockMonitorService = {
    getMonitoringSummary: jest.fn(),
    getStats: jest.fn(),
    getPerformanceMetrics: jest.fn(),
    getHealthStatus: jest.fn(),
    getPerformanceTrend: jest.fn(),
    getSizeTrend: jest.fn(),
    checkWarnings: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    deleteByPattern: jest.fn(),
    clear: jest.fn(),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockMonitorService.getMonitoringSummary.mockResolvedValue({
      stats: { levels: {}, summary: {} },
      healthStatus: { overall: 'healthy' },
      performanceMetrics: {},
      timestamp: new Date(),
    });
    mockMonitorService.getStats.mockResolvedValue({
      levels: { L1: {}, L2: {} },
      summary: {},
    });
    mockMonitorService.getPerformanceMetrics.mockResolvedValue(
      new Map([
        ['L1', { avgResponseTime: 1 }],
        ['L2', { avgResponseTime: 2 }],
      ])
    );
    mockMonitorService.getHealthStatus.mockResolvedValue({
      L1: { status: 'healthy' },
      L2: { status: 'healthy' },
      overall: 'healthy',
    });
    mockMonitorService.getPerformanceTrend.mockReturnValue({
      timestamps: [],
      avgResponseTimes: [],
      errorRates: [],
    });
    mockMonitorService.getSizeTrend.mockResolvedValue(
      new Map([
        ['L1', [100]],
        ['L2', [200]],
      ])
    );
    mockMonitorService.checkWarnings.mockResolvedValue(['warn-1']);

    mockCacheService.get.mockResolvedValue('cached-value');
    mockCacheService.set.mockResolvedValue(undefined);
    mockCacheService.delete.mockResolvedValue(undefined);
    mockCacheService.deleteMany.mockResolvedValue(undefined);
    mockCacheService.deleteByPattern.mockResolvedValue(3);
    mockCacheService.clear.mockResolvedValue(undefined);

    mockPermissionService.checkSystemPermission.mockImplementation(
      async (_userId: string, permission: SystemPermission) =>
        permission === SystemPermission.SYSTEM_MONITOR
    );

    moduleRef = await Test.createTestingModule({
      controllers: [CacheMonitorController],
      providers: [
        { provide: CacheMonitorService, useValue: mockMonitorService },
        { provide: MultiLevelCacheService, useValue: mockCacheService },
        { provide: IPERMISSION_SERVICE, useValue: mockPermissionService },
        RolesGuard,
        PermissionsGuard,
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.use((req, _res, next) => {
      (req as { user?: { id: string } }).user = { id: 'test-user' };
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const READ_ENDPOINTS: Array<{ method: string; path: string }> = [
    { method: 'get', path: '/api/v1/cache-monitor/summary' },
    { method: 'get', path: '/api/v1/cache-monitor/stats' },
    { method: 'get', path: '/api/v1/cache-monitor/health' },
    { method: 'get', path: '/api/v1/cache-monitor/performance' },
    { method: 'get', path: '/api/v1/cache-monitor/performance-trend?level=L1' },
    { method: 'get', path: '/api/v1/cache-monitor/size-trend?minutes=60' },
    { method: 'get', path: '/api/v1/cache-monitor/warnings' },
    { method: 'get', path: '/api/v1/cache-monitor/value?key=foo' },
  ];

  const WRITE_ENDPOINTS: Array<{ method: string; path: string }> = [
    { method: 'post', path: '/api/v1/cache-monitor/value' },
    { method: 'delete', path: '/api/v1/cache-monitor/value?key=foo' },
    { method: 'delete', path: '/api/v1/cache-monitor/pattern?pattern=foo*' },
    { method: 'delete', path: '/api/v1/cache-monitor/values' },
    { method: 'post', path: '/api/v1/cache-monitor/refresh' },
    { method: 'post', path: '/api/v1/cache-monitor/cleanup' },
  ];

  describe('when user has only SYSTEM_MONITOR permission', () => {
    it('should allow all read endpoints with 200', async () => {
      for (const ep of READ_ENDPOINTS) {
        const res = await request(app.getHttpServer())[ep.method as 'get'](
          ep.path
        );
        expect(res.status).toBe(200);
      }
    });

    it('should reject all write endpoints with 403', async () => {
      for (const ep of WRITE_ENDPOINTS) {
        const res = await request(app.getHttpServer())[ep.method as 'get'](
          ep.path
        );
        expect(res.status).toBe(403);
      }
      expect(mockCacheService.set).not.toHaveBeenCalled();
      expect(mockCacheService.delete).not.toHaveBeenCalled();
      expect(mockCacheService.deleteByPattern).not.toHaveBeenCalled();
      expect(mockCacheService.deleteMany).not.toHaveBeenCalled();
      expect(mockCacheService.clear).not.toHaveBeenCalled();
    });
  });

  describe('when user has SYSTEM_ADMIN permission', () => {
    it('should allow write endpoints and delegate to cache service', async () => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const setRes = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/value')
        .send({ key: 'foo', value: 'bar', ttl: 60 });
      expect(setRes.status).toBe(200);
      expect(mockCacheService.set).toHaveBeenCalledWith('foo', 'bar', 60);

      const deleteRes = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/value?key=foo'
      );
      expect(deleteRes.status).toBe(200);
      expect(mockCacheService.delete).toHaveBeenCalledWith('foo');

      const patternRes = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=foo*'
      );
      expect(patternRes.status).toBe(200);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('foo*');

      const valuesRes = await request(app.getHttpServer())
        .delete('/api/v1/cache-monitor/values')
        .send({ keys: ['a', 'b'] });
      expect(valuesRes.status).toBe(200);
      expect(mockCacheService.deleteMany).toHaveBeenCalledWith(['a', 'b']);

      const cleanupRes = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({ level: 'ALL' });
      expect(cleanupRes.status).toBe(200);
      expect(mockCacheService.clear).toHaveBeenCalled();
    });
  });

  describe('when user has no permission', () => {
    it('should reject all endpoints with 403', async () => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(false);

      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/summary'
      );
      expect(res.status).toBe(403);
    });

    it('should throw ForbiddenException with permission_insufficient', async () => {
      mockPermissionService.checkSystemPermission.mockRejectedValue(
        new ForbiddenException('权限不足')
      );
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/summary'
      );
      expect(res.status).toBe(403);
    });
  });

  describe('decorator metadata contract (#217)', () => {
    let reflector: Reflector;

    beforeEach(() => {
      reflector = moduleRef.get<Reflector>(Reflector);
    });

    const readHandlers: Array<keyof CacheMonitorController> = [
      'getSummary',
      'getStats',
      'getHealthStatus',
      'getPerformanceMetrics',
      'getPerformanceTrend',
      'getSizeTrend',
      'getWarnings',
      'getValue',
    ];

    const writeHandlers: Array<keyof CacheMonitorController> = [
      'setValue',
      'deleteValue',
      'deleteByPattern',
      'deleteValues',
      'refresh',
      'cleanup',
    ];

    const getPermissions = (method: string): SystemPermission[] | undefined => {
      const target = CacheMonitorController.prototype as unknown as Record<
        string,
        () => void
      >;
      return reflector.getAllAndOverride<SystemPermission[] | undefined>(
        PERMISSIONS_KEY,
        [target[method], CacheMonitorController]
      );
    };

    it('should require SYSTEM_MONITOR on every read endpoint', () => {
      for (const handler of readHandlers) {
        expect(getPermissions(handler)).toEqual([
          SystemPermission.SYSTEM_MONITOR,
        ]);
      }
    });

    it('should require SYSTEM_ADMIN on every write endpoint', () => {
      for (const handler of writeHandlers) {
        expect(getPermissions(handler)).toEqual([
          SystemPermission.SYSTEM_ADMIN,
        ]);
      }
    });
  });
});
