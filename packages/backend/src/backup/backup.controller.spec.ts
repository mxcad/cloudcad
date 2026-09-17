import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupScheduler } from './backup.scheduler';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';

describe('BackupController', () => {
  let controller: BackupController;

  const mockBackupService = {
    backup: jest.fn(),
    listBackups: jest.fn(),
    deleteBackup: jest.fn(),
  };

  const mockBackupScheduler = {
    runManualBackup: jest.fn(),
    handleScheduledBackup: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: mockBackupService },
        { provide: BackupScheduler, useValue: mockBackupScheduler },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<BackupController>(BackupController);
  });

  describe('permission metadata', () => {
    it('should require SYSTEM_ADMIN at class level', () => {
      const reflector = new Reflector();
      const permissions = reflector.getAllAndOverride<SystemPermission[]>(
        PERMISSIONS_KEY,
        [BackupController.prototype.triggerBackup, BackupController]
      );
      expect(permissions).toEqual([SystemPermission.SYSTEM_ADMIN]);
    });
  });

  describe('triggerBackup', () => {
    it('should delegate to scheduler with operator id and return result', async () => {
      mockBackupScheduler.runManualBackup.mockResolvedValue({
        filename: 'cloudcad-20260826-010000.dump',
        sizeBytes: 2048,
        durationMs: 500,
        deletedCount: 1,
      });

      const result = await controller.triggerBackup({
        user: { id: 'admin-1' },
      } as never);

      expect(mockBackupScheduler.runManualBackup).toHaveBeenCalledWith(
        'admin-1'
      );
      expect(result).toEqual({
        success: true,
        filename: 'cloudcad-20260826-010000.dump',
        sizeBytes: 2048,
        durationMs: 500,
        deletedCount: 1,
      });
    });
  });

  describe('listBackups', () => {
    it('should return list with total', async () => {
      mockBackupService.listBackups.mockResolvedValue([
        {
          name: 'cloudcad-20260826-010000.dump',
          sizeBytes: 42,
          modifiedAt: new Date('2026-08-26T01:00:00Z'),
        },
      ]);

      const result = await controller.listBackups();

      expect(result.total).toBe(1);
      expect(result.data[0].name).toBe('cloudcad-20260826-010000.dump');
      expect(result.data[0].sizeBytes).toBe(42);
    });
  });

  describe('deleteBackup', () => {
    it('should delete and return success', async () => {
      mockBackupService.deleteBackup.mockResolvedValue(undefined);

      const result = await controller.deleteBackup(
        'cloudcad-20260826-010000.dump'
      );

      expect(mockBackupService.deleteBackup).toHaveBeenCalledWith(
        'cloudcad-20260826-010000.dump'
      );
      expect(result.success).toBe(true);
    });

    it('should map invalid name to BadRequestException', async () => {
      mockBackupService.deleteBackup.mockRejectedValue(
        new Error('非法备份文件名')
      );

      await expect(controller.deleteBackup('../evil')).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
