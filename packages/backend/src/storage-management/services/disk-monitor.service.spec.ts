import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as path from 'path';
import type { AppConfig } from '../../config/app.config';
import { DiskMonitorService } from './disk-monitor.service';

describe('DiskMonitorService', () => {
  let service: DiskMonitorService;
  const tmpDir = os.tmpdir();

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue(tmpDir),
    } as unknown as ConfigService<AppConfig>;
    service = new DiskMonitorService(configService);
  });

  describe('getDiskStats', () => {
    it('should report ok with real byte counts for an existing path', () => {
      const stats = service.getDiskStats(tmpDir);

      expect(stats.ok).toBe(true);
      expect(stats.reason).toBeUndefined();
      // free 必须是实数且为正——若误用 frsize（Windows 上为 undefined）会得 NaN
      expect(Number.isFinite(stats.free)).toBe(true);
      expect(stats.free).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(stats.free);
      expect(stats.used).toBe(stats.total - stats.free);
      expect(stats.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(stats.usagePercentage).toBeLessThanOrEqual(100);
      expect(stats.path).toBe(path.resolve(tmpDir));
    });

    it('should fall back to filesDataPath when no path is given', () => {
      const stats = service.getDiskStats();

      expect(stats.ok).toBe(true);
      expect(stats.path).toBe(path.resolve(tmpDir));
    });

    it('should mark unreachable paths as unavailable instead of reporting 0', () => {
      const stats = service.getDiskStats(
        path.join(tmpDir, 'no-such-dir-for-disk-monitor-test')
      );

      expect(stats.ok).toBe(false);
      expect(stats.reason).toBe('path-unreachable');
      expect(stats.free).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.used).toBe(0);
      expect(stats.usagePercentage).toBe(0);
    });
  });

  describe('checkDiskStatus', () => {
    it('should not claim critically low space when the disk cannot be read', () => {
      const status = service.checkDiskStatus(
        path.join(tmpDir, 'no-such-dir-for-disk-monitor-test')
      );

      expect(status.stats.ok).toBe(false);
      expect(status.warning).toBe(false);
      expect(status.critical).toBe(false);
      expect(status.message).toMatch(/unknown \(path-unreachable\)/);
      // 关键回归：不得把探测失败渲染成「空间严重不足」
      expect(status.message).not.toMatch(/critically low/i);
    });

    it('should flag critical space when the disk is genuinely nearly full', () => {
      service.getDiskStats = jest.fn().mockReturnValue({
        ok: true,
        path: tmpDir,
        total: 10 * 1024 ** 3,
        free: 1024 * 1024,
        used: 9 * 1024 ** 3,
        usagePercentage: 90,
      });

      const status = service.checkDiskStatus(tmpDir);

      expect(status.critical).toBe(true);
      expect(status.warning).toBe(false);
      expect(status.message).toMatch(/critically low/i);
    });

    it('should flag warning for tight but readable space', () => {
      // 落在 critical(10GB) 与 warning(20GB) 阈值之间
      service.getDiskStats = jest.fn().mockReturnValue({
        ok: true,
        path: tmpDir,
        total: 100 * 1024 ** 3,
        free: 15 * 1024 ** 3,
        used: 85 * 1024 ** 3,
        usagePercentage: 85,
      });

      const status = service.checkDiskStatus(tmpDir);

      expect(status.critical).toBe(false);
      expect(status.warning).toBe(true);
    });
  });

  describe('getHealthReport', () => {
    it('should be unhealthy when the disk cannot be read', () => {
      service.getDiskStats = jest.fn().mockReturnValue({
        ok: false,
        reason: 'path-unreachable',
        path: '/missing/path',
        total: 0,
        free: 0,
        used: 0,
        usagePercentage: 0,
      });

      const report = service.getHealthReport();

      expect(report.healthy).toBe(false);
      expect(report.status.warning).toBe(false);
      expect(report.status.critical).toBe(false);
      expect(report.recommendation).toMatch(/Disk stats unavailable/);
      expect(report.recommendation).toContain('/missing/path');
    });

    it('should be healthy for a readable disk with ample space', () => {
      service.getDiskStats = jest.fn().mockReturnValue({
        ok: true,
        path: tmpDir,
        total: 500 * 1024 ** 3,
        free: 200 * 1024 ** 3,
        used: 300 * 1024 ** 3,
        usagePercentage: 60,
      });

      const report = service.getHealthReport();

      expect(report.healthy).toBe(true);
      expect(report.status.message).not.toMatch(/critically low/i);
    });
  });
});
