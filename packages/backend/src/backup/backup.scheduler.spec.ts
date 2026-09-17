import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackupScheduler } from './backup.scheduler';
import { BackupService, BackupVerifyError } from './backup.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';

describe('BackupScheduler', () => {
  let scheduler: BackupScheduler;

  const mockBackupService = {
    backup: jest.fn(),
    listBackups: jest.fn(),
    deleteBackup: jest.fn(),
    restoreDrill: jest.fn(),
    pushRemote: jest.fn(),
    pushAuditArchiveRemote: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAlertService = {
    raise: jest.fn(),
    resolveBySourceKey: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockTaskRunService = {
    run: jest.fn(async (_taskName: string, fn: () => Promise<unknown>) => fn()),
    register: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRuntimeConfigService.getValue.mockResolvedValue(true);
    mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'backup') {
        return { enabled: true, cron: '0 1 * * *', drillEnabled: true };
      }
      return def;
    });
    mockTaskRunService.run.mockImplementation(
      async (_taskName: string, fn: () => Promise<unknown>) => fn()
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupScheduler,
        { provide: BackupService, useValue: mockBackupService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AlertService, useValue: mockAlertService },
        {
          provide: RuntimeConfigService,
          useValue: mockRuntimeConfigService,
        },
        { provide: TaskRunService, useValue: mockTaskRunService },
      ],
    }).compile();

    scheduler = module.get<BackupScheduler>(BackupScheduler);
  });

  it('should register manual trigger runner on construction', () => {
    expect(mockTaskRunService.register).toHaveBeenCalledWith(
      TASK_NAMES.BACKUP.DATABASE,
      expect.objectContaining({
        description: expect.any(String),
        execute: expect.any(Function),
      })
    );
  });

  describe('handleScheduledBackup', () => {
    it('should run backup via TaskRunService when enabled', async () => {
      await scheduler.handleScheduledBackup();

      expect(mockTaskRunService.run).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.DATABASE,
        expect.any(Function)
      );
      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('should skip when runtime-config switch is disabled', async () => {
      mockRuntimeConfigService.getValue.mockResolvedValue(false);

      await scheduler.handleScheduledBackup();

      expect(mockTaskRunService.run).not.toHaveBeenCalled();
    });

    it('should skip when env kill-switch BACKUP_ENABLED=false', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'backup') return { enabled: false };
        return def;
      });

      await scheduler.handleScheduledBackup();

      expect(mockTaskRunService.run).not.toHaveBeenCalled();
    });

    it('should raise task_run_failed alert and not throw when backup fails', async () => {
      mockTaskRunService.run.mockRejectedValue(new Error('pg_dump failed'));

      await expect(scheduler.handleScheduledBackup()).resolves.toBeUndefined();

      expect(mockAlertService.raise).toHaveBeenCalledWith({
        source: 'scheduler:backup',
        messageKey: 'task_run_failed',
        level: AlertLevel.P2,
        message: expect.stringContaining('pg_dump failed'),
        detail: expect.objectContaining({ error: 'pg_dump failed' }),
      });
    });

    it('should check runtime switch with backupEnabled key', async () => {
      await scheduler.handleScheduledBackup();

      expect(mockRuntimeConfigService.getValue).toHaveBeenCalledWith(
        TASK_ENABLED_KEYS.BACKUP,
        true
      );
    });
  });

  describe('runManualBackup', () => {
    it('should run with MANUAL trigger and operator id', async () => {
      mockBackupService.backup.mockResolvedValue({
        filename: 'cloudcad-20260826-010000.dump',
        sizeBytes: 1,
        durationMs: 10,
        deletedCount: 0,
      });

      await scheduler.runManualBackup('user-1');

      expect(mockTaskRunService.run).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.DATABASE,
        expect.any(Function),
        { trigger: 'MANUAL', triggeredBy: 'user-1' }
      );
    });
  });

  describe('restore drill (#320)', () => {
    it('should register restore-drill manual trigger runner on construction', () => {
      expect(mockTaskRunService.register).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.RESTORE_DRILL,
        expect.objectContaining({
          description: expect.any(String),
          execute: expect.any(Function),
        })
      );
    });

    it('should run drill via TaskRunService when enabled', async () => {
      await scheduler.handleScheduledRestoreDrill();

      expect(mockTaskRunService.run).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.RESTORE_DRILL,
        expect.any(Function)
      );
      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('should skip when BACKUP_DRILL_ENABLED is disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'backup') return { drillEnabled: false };
        return def;
      });

      await scheduler.handleScheduledRestoreDrill();

      expect(mockTaskRunService.run).not.toHaveBeenCalled();
    });

    it('should raise P1 restore-drill alert when drill fails', async () => {
      mockTaskRunService.run.mockRejectedValue(new Error('pg_restore failed'));

      await expect(
        scheduler.handleScheduledRestoreDrill()
      ).resolves.toBeUndefined();

      expect(mockAlertService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'restore-drill',
          level: AlertLevel.P1,
          message: expect.stringContaining('pg_restore failed'),
        })
      );
    });

    it('should route BackupVerifyError to P1 backup-verify alert on scheduled backup', async () => {
      mockTaskRunService.run.mockRejectedValue(
        new BackupVerifyError('备份完整性校验失败（pg_restore --list）: bad')
      );

      await expect(scheduler.handleScheduledBackup()).resolves.toBeUndefined();

      expect(mockAlertService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'backup-verify',
          messageKey: 'backup_verify_failed',
          level: AlertLevel.P1,
        })
      );
    });
  });

  describe('remote push (#319)', () => {
    it('should register remote-push manual trigger runner on construction', () => {
      expect(mockTaskRunService.register).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.REMOTE_PUSH,
        expect.objectContaining({
          description: expect.any(String),
          execute: expect.any(Function),
        })
      );
    });

    it('should skip push when remote type is unconfigured or none', async () => {
      await scheduler.handleScheduledBackup();

      expect(mockBackupService.pushRemote).not.toHaveBeenCalled();
      expect(mockTaskRunService.run).not.toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.REMOTE_PUSH,
        expect.any(Function)
      );
    });

    it('should push after successful backup and resolve prior failure alert', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'backup') {
          return {
            enabled: true,
            drillEnabled: true,
            remote: { type: 'rsync' },
          };
        }
        return def;
      });
      mockBackupService.pushRemote.mockResolvedValue({
        type: 'rsync',
        filename: 'cloudcad-20260826-010000.dump',
        sizeBytes: 1,
        durationMs: 5,
        remoteTarget: 'ops@host:/backups/',
        remoteDeletedCount: 0,
      });

      await scheduler.handleScheduledBackup();

      expect(mockTaskRunService.run).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.DATABASE,
        expect.any(Function)
      );
      expect(mockTaskRunService.run).toHaveBeenCalledWith(
        TASK_NAMES.BACKUP.REMOTE_PUSH,
        expect.any(Function)
      );
      expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
        'backup-remote',
        'backup_remote_failed_rsync'
      );
      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('should raise P1 backup-remote alert when push fails but backup succeeded', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'backup') {
          return {
            enabled: true,
            drillEnabled: true,
            remote: { type: 'oss' },
          };
        }
        return def;
      });
      mockBackupService.backup.mockResolvedValue({
        filename: 'cloudcad-20260826-010000.dump',
        sizeBytes: 1,
        durationMs: 5,
        deletedCount: 0,
      });
      mockTaskRunService.run.mockImplementation(
        async (taskName: string, fn: () => Promise<unknown>) => {
          if (taskName === TASK_NAMES.BACKUP.REMOTE_PUSH) {
            throw new Error('ossutil: access denied');
          }
          return fn();
        }
      );

      await expect(scheduler.handleScheduledBackup()).resolves.toBeUndefined();

      // 备份任务本身成功记录，推送失败独立 P1 告警
      expect(mockAlertService.resolveBySourceKey).not.toHaveBeenCalled();
      expect(mockAlertService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'backup-remote',
          messageKey: 'backup_remote_failed_oss',
          level: AlertLevel.P1,
          message: expect.stringContaining('ossutil: access denied'),
          detail: expect.objectContaining({
            task: TASK_NAMES.BACKUP.REMOTE_PUSH,
            error: 'ossutil: access denied',
          }),
        })
      );
    });
  });

  describe('audit archive remote sync (#420)', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'backup') {
          return {
            enabled: true,
            drillEnabled: true,
            remote: { type: 'rsync' },
          };
        }
        return def;
      });
    });

    it('should sync audit archive after backup and resolve prior failure alert', async () => {
      mockBackupService.pushAuditArchiveRemote.mockResolvedValue({
        type: 'rsync',
        fileCount: 3,
        durationMs: 10,
        remoteTarget: 'ops@host:/backups/audit-logs/',
      });

      await scheduler.handleScheduledBackup();

      expect(mockBackupService.pushAuditArchiveRemote).toHaveBeenCalled();
      expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
        'audit-archive-remote',
        'audit_archive_remote_failed_rsync'
      );
      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('should silently skip (no alert) when no archive files to sync', async () => {
      mockBackupService.pushAuditArchiveRemote.mockResolvedValue(null);

      await scheduler.handleScheduledBackup();

      expect(mockBackupService.pushAuditArchiveRemote).toHaveBeenCalled();
      // 无归档文件 → 不 resolve、不告警
      expect(mockAlertService.resolveBySourceKey).not.toHaveBeenCalledWith(
        'audit-archive-remote',
        expect.anything()
      );
      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('should raise P1 audit-archive-remote alert when sync fails', async () => {
      mockBackupService.pushAuditArchiveRemote.mockRejectedValue(
        new Error('rsync: connection refused')
      );

      await expect(scheduler.handleScheduledBackup()).resolves.toBeUndefined();

      expect(mockAlertService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'audit-archive-remote',
          messageKey: 'audit_archive_remote_failed_rsync',
          level: AlertLevel.P1,
          message: expect.stringContaining('rsync: connection refused'),
          detail: expect.objectContaining({
            task: TASK_NAMES.BACKUP.AUDIT_ARCHIVE_SYNC,
            error: 'rsync: connection refused',
          }),
        })
      );
    });
  });
});
