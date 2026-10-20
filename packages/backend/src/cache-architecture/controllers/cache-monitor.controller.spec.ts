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
import { CustomValidationPipe } from '../../common/pipes/validation.pipe';

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
    clearLevel: jest.fn(),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn(),
    // PermissionsGuard 统一走上下文感知检查，委托给基础检查使既有 setup/断言继续有效
    checkSystemPermissionWithContext: jest.fn(),
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
    mockCacheService.deleteByPattern.mockResolvedValue({
      deleted: 3,
      truncated: false,
    });
    mockCacheService.clear.mockResolvedValue(undefined);
    mockCacheService.clearLevel.mockResolvedValue(undefined);

    mockPermissionService.checkSystemPermission.mockImplementation(
      async (_userId: string, permission: SystemPermission) =>
        permission === SystemPermission.SYSTEM_MONITOR
    );
    mockPermissionService.checkSystemPermissionWithContext.mockImplementation(
      (userId: string, permission: SystemPermission) =>
        mockPermissionService.checkSystemPermission(userId, permission)
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
    // 与 AppModule 的 APP_PIPE 保持一致：本测试模块未加载 AppModule，若不挂载全局校验管道，
    // whitelist + forbidNonWhitelisted 的拒绝行为就完全测不到（6 个请求 DTO 曾因此整体 400 上线）
    app.useGlobalPipes(new CustomValidationPipe());
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
    { method: 'get', path: '/api/v1/cache-monitor/key-catalog' },
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

      // 必须是目录里的可删模式——目录外的模式现在会被守卫拦下（见下方 #467 用例）
      const patternRes = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=user:permissions:*'
      );
      expect(patternRes.status).toBe(200);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(
        'user:permissions:*'
      );

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

    it('分级清理 L1/L2 应真正调用 clearLevel（此前为伪成功，落注释后直接返回 success）', async () => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      for (const level of ['L1', 'L2'] as const) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/cache-monitor/cleanup')
          .send({ level });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockCacheService.clearLevel).toHaveBeenCalledWith(level);
      }
      // 分级清理不应触发整库 clear
      expect(mockCacheService.clear).not.toHaveBeenCalled();
    });
  });

  describe('按模式删除的服务端白名单守卫（#467）', () => {
    // 此前的实现把任意字符串直接喂给 L2 的 SCAN+DEL：共享库里住着会话、token
    // 吊销名单、限流计数，手输 `*` 会连带删掉。前端只做了提示，不构成防护。
    beforeEach(() => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);
    });

    it('目录外的模式一律拒绝，且不触碰缓存服务', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=*'
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('*');
      expect(mockCacheService.deleteByPattern).not.toHaveBeenCalled();
    });

    it('基础设施模式拒绝（会话键会让全体用户登出）', async () => {
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=mxcad:sess:*'
      );
      expect(res.status).toBe(400);
      expect(mockCacheService.deleteByPattern).not.toHaveBeenCalled();
    });

    it('user:* 放行：与它共享前缀的基础设施键已随 #484 退役', async () => {
      // user:* 曾因通配会命中基础设施键 user:blacklist:* 被拒；该键退役后 user:*
      // 只剩 user:<id> 与 user:permissions:*，两类都是可重建的业务缓存。
      mockCacheService.deleteByPattern.mockResolvedValueOnce({
        deleted: 3,
        truncated: false,
      });
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=user:*'
      );
      expect(res.status).toBe(200);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith('user:*');
    });

    it('目录内的业务缓存模式放行', async () => {
      mockCacheService.deleteByPattern.mockResolvedValueOnce({
        deleted: 12,
        truncated: false,
      });
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=role:permissions:*'
      );
      expect(res.status).toBe(200);
      expect(res.body.truncated).toBe(false);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(
        'role:permissions:*'
      );
    });

    it('cleanup 的模式分支走同一守卫', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({ pattern: 'ratelimit:*' });
      expect(res.status).toBe(400);
      expect(mockCacheService.deleteByPattern).not.toHaveBeenCalled();
    });

    it('达到删除上限时明确告知仍有键未删除，不谎报清理完成', async () => {
      mockCacheService.deleteByPattern.mockResolvedValueOnce({
        deleted: 5000,
        truncated: true,
      });
      const res = await request(app.getHttpServer()).delete(
        '/api/v1/cache-monitor/pattern?pattern=user:permissions:*'
      );
      expect(res.status).toBe(200);
      expect(res.body.truncated).toBe(true);
      expect(res.body.message).toContain('未删除');
    });
  });

  describe('请求 DTO 必须能通过全局校验管道（回归：6 个端点曾整体 400）', () => {
    // 这些 DTO 原先只声明 @ApiProperty、无 class-validator 约束，
    // 在 whitelist + forbidNonWhitelisted 下每个字段都被判为「未白名单属性」，
    // 前端按契约发 { level: 'ALL' } 这类合法请求也被拒（property level should not exist）。
    beforeEach(() => {
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);
    });

    it('清空所有缓存：前端实际请求体 { level: "ALL" } 通过', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({ level: 'ALL' });
      expect(res.status).toBe(200);
      expect(mockCacheService.clear).toHaveBeenCalled();
    });

    it('清空缓存的文案如实说明未删除 Redis 数据（#481）', async () => {
      // L2 的 clear 只重置计数器、不删条目（全仓无 FLUSHDB），
      // 文案若说「清理所有缓存」会让运维误以为 Redis 已清干净
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({ level: 'ALL' });
      expect(res.body.message).toContain('未删除 Redis 数据');
      expect(res.body.message).not.toContain('成功清理所有缓存');
    });

    it('清空缓存：空请求体也通过（两个字段均声明为可选）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({});
      expect(res.status).toBe(200);
    });

    it('按模式清理：{ pattern } 通过', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/cleanup')
        .send({ pattern: 'user:permissions:*' });
      expect(res.status).toBe(200);
      expect(mockCacheService.deleteByPattern).toHaveBeenCalledWith(
        'user:permissions:*'
      );
    });

    it('性能趋势：query 参数 { level, minutes } 通过', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/performance-trend?level=L1&minutes=60'
      );
      expect(res.status).toBe(200);
      expect(mockMonitorService.getPerformanceTrend).toHaveBeenCalledWith(
        'L1',
        60
      );
    });

    it('设置缓存：{ key, value, ttl } 通过', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/value')
        .send({ key: 'permission:1', value: { a: 1 }, ttl: 60 });
      expect(res.status).toBe(200);
    });

    it('刷新缓存：{ key } 通过', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cache-monitor/refresh')
        .send({ key: 'permission:1' });
      expect(res.status).toBe(200);
    });

    it('批量删除：{ keys } 通过', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/cache-monitor/values')
        .send({ keys: ['a:1', 'b:2'] });
      expect(res.status).toBe(200);
    });

    it('统计查询：{ level, includePerformance } 通过', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/stats?level=L1&includePerformance=true'
      );
      expect(res.status).toBe(200);
    });

    it('放开后原有约束仍然生效：非法枚举/空 key 一律 400', async () => {
      for (const [method, path, body] of [
        ['post', '/api/v1/cache-monitor/cleanup', { level: 'L9' }],
        ['post', '/api/v1/cache-monitor/value', {}],
        ['delete', '/api/v1/cache-monitor/values', { keys: ['a', 3] }],
        ['post', '/api/v1/cache-monitor/refresh', { key: '' }],
        ['post', '/api/v1/cache-monitor/cleanup', { level: 'L9', pattern: 'x' }],
      ] as const) {
        const res = await request(app.getHttpServer())[method](path).send(body);
        expect(res.status).toBe(400);
      }
      const trend = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/performance-trend'
      );
      expect(trend.status).toBe(400);
      const badTrend = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/performance-trend?level=L3'
      );
      expect(badTrend.status).toBe(400);
    });
  });

  describe('缓存键目录（GET key-catalog）', () => {
    it('返回目录且字段完整', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/key-catalog'
      );
      expect(res.status).toBe(200);

      const { entries } = res.body as {
        entries: Array<Record<string, string>>;
      };
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        for (const field of [
          'id',
          'name',
          'pattern',
          'description',
          'scope',
          'removalEffect',
          'ttl',
          'example',
        ]) {
          expect(entry[field]).toBeTruthy();
        }
        expect(['cache', 'infra']).toContain(entry.scope);
      }
    });

    it('会话与限流键必须标为 infra（页面据此禁用删除）', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/key-catalog'
      );
      const byPattern = new Map(
        (res.body as { entries: Array<{ pattern: string; scope: string }> })
          .entries.map((e) => [e.pattern, e.scope])
      );

      expect(byPattern.get('mxcad:sess:*')).toBe('infra');
      expect(byPattern.get('ratelimit:*')).toBe('infra');
      // 业务权限缓存应保持可删除
      expect(byPattern.get('system_perm:*:*')).toBe('cache');
      expect(byPattern.get('user:permissions:*')).toBe('cache');
    });

    it('占位符示例 user:* 必须是真实前缀（前端曾展示不存在的 user: 前缀）', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/cache-monitor/key-catalog'
      );
      const patterns = (res.body as { entries: Array<{ pattern: string }> })
        .entries.map((e) => e.pattern);

      expect(patterns).toContain('user:permissions:*');
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
      'getKeyCatalog',
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
