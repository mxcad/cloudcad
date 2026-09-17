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

/**
 * #321 三权分立（等保 8.5.2）回归测试
 *
 * 审计管理员（AUDIT_ADMIN 权限位）与系统管理员（SYSTEM_ADMIN）分离：
 * - POST /audit/cleanup 仅 AUDIT_ADMIN（从 SYSTEM_ADMIN 收窄）
 * - logs / logs/:id / statistics / export 由 AUDIT_ADMIN 或 SYSTEM_ADMIN 任一放行
 *
 * #323 审计受限删除（等保 8.4.3.3）回归测试：
 * - confirm=true 二次确认（缺失/false 均 400）
 * - daysToKeep 低于保留期下限 400（仅超保留期记录可删）
 * - 未归档时间段 409 拒删且不产生删除；成功清理动作本身记 AUDIT_CLEANUP 留痕
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditArchiveService } from './audit-archive.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CustomValidationPipe } from '../common/pipes/validation.pipe';
import {
  IPERMISSION_SERVICE,
  type IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionCheckMode,
} from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';

describe('AuditLogController permissions (#321 三权分立)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let reflector: Reflector;

  const mockAuditLogService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getStatistics: jest.fn(),
    exportLogs: jest.fn(),
    log: jest.fn(),
    cleanupOldLogs: jest.fn(),
  };

  const mockAuditArchiveService = {
    verifyArchivedForCutoff: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPermissionService: {
    checkSystemPermission: jest.Mock;
  } = {
    checkSystemPermission: jest.fn(),
  };

  beforeEach(async () => {
    // 注意：仓库 jest 配置 resetMocks=true，所有 mock 行为必须在 beforeEach 中设置
    mockAuditLogService.findAll.mockResolvedValue({
      logs: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    mockAuditLogService.findOne.mockResolvedValue({ id: 'log-1' });
    mockAuditLogService.getStatistics.mockResolvedValue({ total: 0 });
    mockAuditLogService.exportLogs.mockResolvedValue({
      buffer: Buffer.from('csv'),
      filename: 'a.csv',
      mimeType: 'text/csv',
    });
    mockAuditLogService.log.mockResolvedValue(undefined);
    mockAuditLogService.cleanupOldLogs.mockResolvedValue(0);
    mockAuditArchiveService.verifyArchivedForCutoff.mockResolvedValue([]);
    mockConfigService.get.mockImplementation((key: string, def: unknown) =>
      key === 'audit.retentionDays' ? 183 : def
    );

    moduleRef = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: AuditArchiveService, useValue: mockAuditArchiveService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: IPERMISSION_SERVICE, useValue: mockPermissionService },
        PermissionsGuard,
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    // 与 main.ts 一致的全局校验管道（#323 DTO 校验依赖此管道生效）
    app.useGlobalPipes(new CustomValidationPipe());
    // 模拟已认证用户（PermissionsGuard 按 userId 实时解析权限）
    app.use(
      (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'test-user' };
        next();
      }
    );
    await app.init();
    reflector = app.get(Reflector);
  });

  afterEach(async () => {
    await app.close();
  });

  /** 模拟「仅拥有某些权限」的用户 */
  const grantPermissions = (...owned: SystemPermission[]) => {
    mockPermissionService.checkSystemPermission.mockImplementation(
      async (_userId: string, permission: SystemPermission) =>
        owned.includes(permission)
    );
  };

  describe('权限元数据声明', () => {
    // 与 PermissionsGuard 相同的读取方式：方法级优先于类级
    const resolveMeta = (
      methodName: string
    ): { permissions: SystemPermission[]; mode: PermissionCheckMode } => {
      const prototype = AuditLogController.prototype as Record<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >;
      const descriptor = Object.getOwnPropertyDescriptor(
        prototype,
        methodName
      )!;
      return {
        permissions: reflector.getAllAndOverride<SystemPermission[]>(
          PERMISSIONS_KEY,
          [descriptor.value, AuditLogController]
        ),
        mode:
          reflector.getAllAndOverride<PermissionCheckMode>(
            PERMISSIONS_MODE_KEY,
            [descriptor.value, AuditLogController]
          ) ?? PermissionCheckMode.ALL,
      };
    };

    it('cleanup 方法级覆盖为仅 AUDIT_ADMIN（从 SYSTEM_ADMIN 收窄）', () => {
      const meta = resolveMeta('cleanupOldLogs');
      expect(meta.permissions).toEqual([SystemPermission.AUDIT_ADMIN]);
      expect(meta.mode).toBe(PermissionCheckMode.ALL);
    });

    it('logs/logs 详情/statistics/export 继承类级 AUDIT_ADMIN 或 SYSTEM_ADMIN 任一即可（ANY 模式）', () => {
      const expected = [
        'findAll',
        'findOne',
        'getStatistics',
        'exportLogs',
      ] as const;
      for (const methodName of expected) {
        const meta = resolveMeta(methodName);
        expect(meta.permissions).toEqual(
          expect.arrayContaining([
            SystemPermission.AUDIT_ADMIN,
            SystemPermission.SYSTEM_ADMIN,
          ])
        );
        expect(meta.mode).toBe(PermissionCheckMode.ANY);
      }
    });
  });

  describe('真实 PermissionsGuard 行为（等保 8.5.2 验收）', () => {
    it('仅 SYSTEM_ADMIN 的用户调用 cleanup 返回 403', async () => {
      grantPermissions(SystemPermission.SYSTEM_ADMIN);

      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 90 });

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
    });

    it('仅 AUDIT_ADMIN 的用户可正常清理审计日志', async () => {
      grantPermissions(SystemPermission.AUDIT_ADMIN);

      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 365, confirm: true });

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuditArchiveService.verifyArchivedForCutoff).toHaveBeenCalledWith(
        expect.any(Date)
      );
      expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(
        365,
        'test-user'
      );
    });

    it('AUDIT_ADMIN 可查询/统计/导出审计数据', async () => {
      grantPermissions(SystemPermission.AUDIT_ADMIN);

      const logsRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/logs'
      );
      expect(logsRes.status).toBe(HttpStatus.OK);

      const statsRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/statistics'
      );
      expect(statsRes.status).toBe(HttpStatus.OK);

      const detailRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/logs/log-1'
      );
      expect(detailRes.status).toBe(HttpStatus.OK);

      const exportRes = await request(app.getHttpServer())
        .post('/api/v1/audit/export')
        .send({});
      expect(exportRes.status).toBe(HttpStatus.OK);
    });

    it('SYSTEM_ADMIN 仍可查询/统计/导出（只读共存，确认项）', async () => {
      grantPermissions(SystemPermission.SYSTEM_ADMIN);

      const logsRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/logs'
      );
      expect(logsRes.status).toBe(HttpStatus.OK);

      const statsRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/statistics'
      );
      expect(statsRes.status).toBe(HttpStatus.OK);

      const exportRes = await request(app.getHttpServer())
        .post('/api/v1/audit/export')
        .send({});
      expect(exportRes.status).toBe(HttpStatus.OK);
    });

    it('两个权限都没有的用户所有端点返回 403', async () => {
      grantPermissions();

      const logsRes = await request(app.getHttpServer()).get(
        '/api/v1/audit/logs'
      );
      expect(logsRes.status).toBe(HttpStatus.FORBIDDEN);

      const cleanupRes = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 90 });
      expect(cleanupRes.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('#323 受限删除（已归档校验 + 二次确认 + 留痕）', () => {
    beforeEach(() => {
      grantPermissions(SystemPermission.AUDIT_ADMIN);
    });

    it('缺少 confirm 返回 400（DTO 校验），不触发归档查询与删除', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 365 });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(
        mockAuditArchiveService.verifyArchivedForCutoff
      ).not.toHaveBeenCalled();
      expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
    });

    it('confirm=false 返回 400，不删数据', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 365, confirm: false });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
    });

    it('daysToKeep 低于保留期下限返回 400（仅超保留期记录可删），留痕 BELOW_RETENTION_FLOOR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 90, confirm: true });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(
        mockAuditArchiveService.verifyArchivedForCutoff
      ).not.toHaveBeenCalled();
      expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.AUDIT_CLEANUP,
        ResourceType.SYSTEM,
        undefined,
        'test-user',
        false,
        'BELOW_RETENTION_FLOOR',
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          reason: 'BELOW_RETENTION_FLOOR',
          requestedDaysToKeep: 90,
          retentionDays: 183,
          deletedCount: 0,
        })
      );
    });

    it('未归档时间段返回 409 且不删数据，留痕含违规明细', async () => {
      mockAuditArchiveService.verifyArchivedForCutoff.mockResolvedValue([
        { month: '2026-05', reason: 'CSV_MISSING' },
      ]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 365, confirm: true });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.code).toBe('AUDIT_NOT_ARCHIVED');
      expect(res.body.violations).toEqual([
        { month: '2026-05', reason: 'CSV_MISSING' },
      ]);
      expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.AUDIT_CLEANUP,
        ResourceType.SYSTEM,
        undefined,
        'test-user',
        false,
        'NOT_ARCHIVED',
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          reason: 'NOT_ARCHIVED',
          violations: [{ month: '2026-05', reason: 'CSV_MISSING' }],
          deletedCount: 0,
        })
      );
    });

    it('已归档 + confirm=true：执行清理并留痕（操作者/确认参数/范围/结果）', async () => {
      mockAuditLogService.cleanupOldLogs.mockResolvedValue(42);

      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ daysToKeep: 365, confirm: true });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.deletedCount).toBe(42);

      // 归档校验使用与删除一致的 cutoff（now - days）
      const cutoffArg = mockAuditArchiveService.verifyArchivedForCutoff.mock
        .calls[0][0] as Date;
      const expectedCutoff = Date.now() - 365 * 24 * 3600 * 1000;
      expect(Math.abs(cutoffArg.getTime() - expectedCutoff)).toBeLessThan(
        60_000
      );

      expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(
        365,
        'test-user'
      );
      // 清理动作本身记审计：操作者 + confirm + 范围 + 结果
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        AuditAction.AUDIT_CLEANUP,
        ResourceType.SYSTEM,
        undefined,
        'test-user',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          confirm: true,
          effectiveDaysToKeep: 365,
          retentionDays: 183,
          deletedCount: 42,
        })
      );
    });

    it('daysToKeep 缺省时回落到保留期配置（183），不低于下限', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/audit/cleanup')
        .send({ confirm: true });

      expect(res.status).toBe(HttpStatus.OK);
      expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(
        183,
        'test-user'
      );
    });
  });
});
