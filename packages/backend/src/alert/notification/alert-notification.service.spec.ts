import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { AlertRecord } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { EmailService } from '../../notification/email.service';
import { AlertNotificationService } from './alert-notification.service';
import { AlertService } from '../alert.service';
import { AlertLevel, AlertStatus } from '../enums/alert.enum';

describe('AlertNotificationService', () => {
  let service: AlertNotificationService;

  const mockAlertService = { raise: jest.fn() };
  const mockEmailService = {
    sendAlertEmail: jest.fn(),
    sendAggregatedAlertEmail: jest.fn(),
    sendDailyReportEmail: jest.fn(),
  };
  const mockPrisma = {
    alertRecord: { update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };

  const baseConfig = {
    enabled: true,
    to: ['ops@example.com'],
    failEscalate: 5,
    p1WindowMinutes: 15,
    p2DailyHour: 9,
  };
  let alertEmailConfig = { ...baseConfig };

  const mockConfigService = {
    get: jest.fn(),
  };

  function makeRecord(overrides: Partial<AlertRecord> = {}): AlertRecord {
    return {
      id: 'alert-1',
      source: 'disk-monitor',
      messageKey: 'disk_space_critical',
      level: AlertLevel.P0,
      message: '磁盘空间临界',
      detail: { free: '1GB' },
      status: AlertStatus.OPEN,
      resolvedAt: null,
      createdAt: new Date('2026-08-25T00:00:00Z'),
      updatedAt: new Date('2026-08-25T00:00:00Z'),
      ...overrides,
    } as AlertRecord;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    // resetMocks 会清除实现，这里显式恢复（仓库 jest 约定）
    alertEmailConfig = { ...baseConfig };
    mockConfigService.get.mockImplementation(() => alertEmailConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertNotificationService,
        { provide: AlertService, useValue: mockAlertService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AlertNotificationService>(AlertNotificationService);
  });

  afterEach(async () => {
    // 清理 P1 窗口定时器与日报对时定时器，避免用例间泄漏
    await service.onModuleDestroy();
  });

  // ==================== P0 实时邮件 ====================
  describe('onRaised', () => {
    it('should send raised email immediately for P0 when enabled', async () => {
      const record = makeRecord();

      await service.onRaised(record);
      // onRaised 内部为 fire-and-forget，等待微任务 flush
      await new Promise(process.nextTick);

      expect(mockEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendAlertEmail).toHaveBeenCalledWith(
        ['ops@example.com'],
        expect.objectContaining({
          kind: 'raised',
          level: AlertLevel.P0,
          source: 'disk-monitor',
          messageKey: 'disk_space_critical',
        })
      );
    });

    it('should not send for P1/P2', async () => {
      await service.onRaised(makeRecord({ level: AlertLevel.P1 }));
      await service.onRaised(makeRecord({ level: AlertLevel.P2 }));
      await new Promise(process.nextTick);

      expect(mockEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should not send when disabled or recipients empty', async () => {
      alertEmailConfig = { ...baseConfig, enabled: false };
      await service.onRaised(makeRecord());
      alertEmailConfig = { ...baseConfig, to: [] };
      await service.onRaised(makeRecord());
      await new Promise(process.nextTick);

      expect(mockEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should skip self-source alert-email to avoid escalation loop', async () => {
      await service.onRaised(makeRecord({ source: 'alert-email' }));
      await new Promise(process.nextTick);

      expect(mockEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    it('should persist emailNotifiedAt in detail on success', async () => {
      await service.onRaised(makeRecord());
      await new Promise(process.nextTick);

      expect(mockPrisma.alertRecord.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          detail: expect.objectContaining({
            free: '1GB',
            emailNotifiedAt: expect.any(String),
          }),
        },
      });
    });
  });

  // ==================== 失败升级 ====================
  describe('failure escalation', () => {
    it('should mark detail and escalate after consecutive failures reach threshold', async () => {
      mockEmailService.sendAlertEmail.mockRejectedValue(
        new Error('SMTP unavailable')
      );

      for (let i = 0; i < 5; i++) {
        await service.onRaised(makeRecord({ id: `alert-${i}` }));
        await new Promise(process.nextTick);
      }

      // 前 4 次仅标记，第 5 次触发升级告警并重置计数器
      expect(mockAlertService.raise).toHaveBeenCalledTimes(1);
      expect(mockAlertService.raise).toHaveBeenCalledWith({
        source: 'alert-email',
        messageKey: 'email_send_failed',
        level: AlertLevel.P0,
        message: expect.stringContaining('连续 5 次'),
        detail: expect.objectContaining({
          threshold: 5,
          error: 'SMTP unavailable',
        }),
      });
      expect(mockPrisma.alertRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-4' },
        })
      );
    });

    it('should reset failure counter after a successful send', async () => {
      mockEmailService.sendAlertEmail
        .mockRejectedValueOnce(new Error('smtp down'))
        .mockRejectedValueOnce(new Error('smtp down'))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error('smtp down'));

      // 2 次失败 + 1 次成功（计数器清零）+ 4 次失败 < 阈值
      for (let i = 0; i < 7; i++) {
        await service.onRaised(makeRecord({ id: `a-${i}` }));
        await new Promise(process.nextTick);
      }

      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });
  });

  // ==================== 恢复通知 ====================
  describe('onResolved', () => {
    it('should send recovery email only when previously emailed', async () => {
      const emailed = makeRecord({
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        detail: { emailNotifiedAt: '2026-08-25T00:00:00.000Z' },
      });
      const neverEmailed = makeRecord({
        id: 'alert-2',
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        detail: { free: '2GB' },
      });

      await service.onResolved(emailed);
      await service.onResolved(neverEmailed);

      expect(mockEmailService.sendAlertEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendAlertEmail).toHaveBeenCalledWith(
        ['ops@example.com'],
        expect.objectContaining({
          kind: 'resolved',
          source: 'disk-monitor',
        })
      );
    });

    it('should not send recovery email when disabled', async () => {
      alertEmailConfig = { ...baseConfig, enabled: false };
      const emailed = makeRecord({
        detail: { emailNotifiedAt: '2026-08-25T00:00:00.000Z' },
      });

      await service.onResolved(emailed);

      expect(mockEmailService.sendAlertEmail).not.toHaveBeenCalled();
    });
  });

  // ==================== P1 聚合（#312） ====================
  describe('P1 aggregation', () => {
    const p1 = (overrides: Partial<AlertRecord> = {}) =>
      makeRecord({
        level: AlertLevel.P1,
        source: 'scheduler:billing',
        messageKey: 'task_run_failed',
        ...overrides,
      });

    it('should buffer P1 alerts without sending immediately', async () => {
      jest.useFakeTimers();
      try {
        await service.onRaised(p1({ id: 'p1-1' }));

        expect(
          mockEmailService.sendAggregatedAlertEmail
        ).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should merge same-source alerts into one aggregated email at window flush', async () => {
      jest.useFakeTimers();
      try {
        await service.onRaised(p1({ id: 'p1-1' }));
        await service.onRaised(
          p1({
            id: 'p1-2',
            messageKey: 'timeout_orders',
            createdAt: new Date(),
          })
        );

        await jest.advanceTimersByTimeAsync(15 * 60_000);

        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledTimes(
          1
        );
        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledWith(
          ['ops@example.com'],
          expect.objectContaining({
            level: AlertLevel.P1,
            source: 'scheduler:billing',
            count: 2,
            items: expect.arrayContaining([
              expect.objectContaining({ messageKey: 'task_run_failed' }),
              expect.objectContaining({ messageKey: 'timeout_orders' }),
            ]),
          })
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should keep separate windows per source', async () => {
      jest.useFakeTimers();
      try {
        await service.onRaised(p1({ id: 'p1-1', source: 'scheduler:billing' }));
        await service.onRaised(p1({ id: 'p1-2', source: 'cache-monitor' }));

        await jest.advanceTimersByTimeAsync(15 * 60_000);

        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledTimes(
          2
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should start a new window after flush (window sliding)', async () => {
      jest.useFakeTimers();
      try {
        await service.onRaised(p1({ id: 'p1-1' }));
        await jest.advanceTimersByTimeAsync(15 * 60_000);
        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledTimes(
          1
        );

        // flush 后新事件进入新窗口，不立即发送
        await service.onRaised(p1({ id: 'p1-2' }));
        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledTimes(
          1
        );

        await jest.advanceTimersByTimeAsync(15 * 60_000);
        expect(mockEmailService.sendAggregatedAlertEmail).toHaveBeenCalledTimes(
          2
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not send P2 individually', async () => {
      jest.useFakeTimers();
      try {
        await service.onRaised(makeRecord({ level: AlertLevel.P2 }));
        await jest.advanceTimersByTimeAsync(15 * 60_000);

        expect(
          mockEmailService.sendAggregatedAlertEmail
        ).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ==================== P2 每日日报（#312） ====================
  describe('P2 daily report', () => {
    it('should send report with stats grouped by level/source for previous day', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      mockPrisma.alertRecord.findMany.mockResolvedValue([
        p1ReportRow(yesterday, AlertLevel.P1, 'scheduler:billing'),
        p1ReportRow(yesterday, AlertLevel.P1, 'scheduler:billing'),
        p1ReportRow(yesterday, AlertLevel.P0, 'disk-monitor'),
      ]);
      mockPrisma.alertRecord.count.mockResolvedValue(3);

      await service.sendDailyReport(['ops@example.com']);

      expect(mockEmailService.sendDailyReportEmail).toHaveBeenCalledTimes(1);
      const [, payload] = mockEmailService.sendDailyReportEmail.mock
        .calls[0] as [
        string[],
        { total: number; stats: unknown[]; items: unknown[] },
      ];
      expect(payload.total).toBe(3);
      expect(payload.stats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'P1',
            source: 'scheduler:billing',
            count: 2,
          }),
          expect.objectContaining({ level: 'P0', source: 'disk-monitor' }),
        ])
      );
      expect(payload.items).toHaveLength(3);
    });

    function p1ReportRow(
      date: Date,
      level: AlertLevel,
      source: string
    ): AlertRecord {
      return makeRecord({ createdAt: date, level, source });
    }

    it('should skip empty days (no empty report)', async () => {
      mockPrisma.alertRecord.count.mockResolvedValue(0);
      mockPrisma.alertRecord.findMany.mockResolvedValue([]);

      await service.sendDailyReport(['ops@example.com']);

      expect(mockEmailService.sendDailyReportEmail).not.toHaveBeenCalled();
    });

    it('should cap listed items but keep full totals', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      mockPrisma.alertRecord.count.mockResolvedValue(60);
      mockPrisma.alertRecord.findMany.mockResolvedValue(
        Array.from({ length: 60 }, (_, i) =>
          p1ReportRow(yesterday, AlertLevel.P2, `src-${i % 5}`)
        )
      );

      await service.sendDailyReport(['ops@example.com']);

      const [, payload] = mockEmailService.sendDailyReportEmail.mock
        .calls[0] as [string[], { total: number; items: unknown[] }];
      expect(payload.total).toBe(60);
      expect(payload.items.length).toBeLessThanOrEqual(50);
    });
  });
});
