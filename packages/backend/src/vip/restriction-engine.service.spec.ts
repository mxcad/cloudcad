import { Test, type TestingModule } from '@nestjs/testing';
import { QuotaExceededException } from './errors/quota-exceeded.error';
import {
  RESTRICTION_STRATEGY,
  type RestrictionContext,
  type RestrictionStrategy,
} from './interfaces/restriction-strategy.interface';
import { RestrictionEngine } from './restriction-engine.service';
import { MembershipService } from './membership.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

describe('RestrictionEngine', () => {
  let engine: RestrictionEngine;
  let redis: any;
  let membershipService: any;
  let runtimeConfigService: any;
  let strategies: RestrictionStrategy[];
  let passingStrategy: RestrictionStrategy;
  let failingStrategy: RestrictionStrategy;

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      eval: jest.fn(),
      decr: jest.fn(),
    };
    membershipService = {
      getEffectiveMembership: jest.fn(),
      getQuota: jest.fn(),
    };
    runtimeConfigService = {
      getValue: jest.fn(),
    };

    passingStrategy = {
      key: 'pass',
      check: jest.fn().mockResolvedValue({ allowed: true, key: 'pass' }),
    };
    failingStrategy = {
      key: 'fail',
      check: jest.fn().mockResolvedValue({
        allowed: false,
        key: 'fail',
        message: 'Access denied: fail',
      }),
    };
    strategies = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestrictionEngine,
        { provide: RESTRICTION_STRATEGY, useValue: strategies },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: MembershipService, useValue: membershipService },
        { provide: RuntimeConfigService, useValue: runtimeConfigService },
      ],
    }).compile();

    engine = module.get<RestrictionEngine>(RestrictionEngine);
  });

  describe('evaluate', () => {
    it('should pass when all strategies pass', async () => {
      strategies.length = 0;
      strategies.push(passingStrategy, passingStrategy);
      await expect(
        engine.evaluate({ userId: 'u1', tierLevel: 0, tierConfig: {} })
      ).resolves.toBeUndefined();
    });

    it('should fail-fast on first failing strategy', async () => {
      strategies.length = 0;
      strategies.push(failingStrategy, passingStrategy);
      await expect(
        engine.evaluate({ userId: 'u1', tierLevel: 0, tierConfig: {} })
      ).rejects.toThrow(QuotaExceededException);
      expect(passingStrategy.check).not.toHaveBeenCalled();
    });

    it('should throw QuotaExceededException with strategy message', async () => {
      strategies.length = 0;
      strategies.push(failingStrategy);
      await expect(
        engine.evaluate({ userId: 'u1', tierLevel: 0, tierConfig: {} })
      ).rejects.toThrow('Access denied: fail');
    });

    it('should throw QuotaExceededException with quota details', async () => {
      strategies.length = 0;
      strategies.push({
        key: 'quota.max_projects',
        check: jest.fn().mockResolvedValue({
          allowed: false,
          key: 'quota.max_projects',
          messageKey: 'error.quota.max_projects_exceeded',
          messageArgs: { current: 5, limit: 5 },
          current: 5,
          limit: 5,
          configLimit: 5,
          need: 1,
        }),
      });
      let caught: QuotaExceededException | undefined;
      try {
        await engine.evaluate({ userId: 'u1', tierLevel: 0, tierConfig: {} });
      } catch (error) {
        caught = error as QuotaExceededException;
      }
      expect(caught).toBeInstanceOf(QuotaExceededException);
      expect(caught?.getStatus()).toBe(403);
      expect(caught?.getResponse()).toMatchObject({
        code: 'QUOTA_EXCEEDED',
        restrictionKey: 'quota.max_projects',
        current: 5,
        limit: 5,
        configLimit: 5,
        need: 1,
      });
    });
  });

  describe('buildContext', () => {
    it('should build context from effective membership snapshot', async () => {
      membershipService.getEffectiveMembership.mockResolvedValue({
        tierLevel: 0,
        configs: { 'quota.personal_storage_mb': 10 },
      });

      const ctx = await engine.buildContext('u1', { incrementBytes: 100 });
      expect(ctx.tierLevel).toBe(0);
      expect(ctx.tierConfig).toEqual({ 'quota.personal_storage_mb': 10 });
      expect(ctx.incrementBytes).toBe(100);
    });

    it('should build context with actual tier for valid membership', async () => {
      membershipService.getEffectiveMembership.mockResolvedValue({
        tierLevel: 2,
        configs: { 'quota.conversion_window_count': 500 },
      });

      const ctx = await engine.buildContext('u1');
      expect(ctx.tierLevel).toBe(2);
      expect(ctx.tierConfig).toEqual({
        'quota.conversion_window_count': 500,
      });
    });
  });

  describe('tryReserveConversionCount', () => {
    it('should reserve and return true when under the window limit', async () => {
      // 窗口次数 10、窗口小时 2
      membershipService.getQuota
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(1);

      const result = await engine.tryReserveConversionCount('u1');

      expect(membershipService.getQuota).toHaveBeenCalledWith(
        'u1',
        'quota.conversion_window_count'
      );
      expect(membershipService.getQuota).toHaveBeenCalledWith(
        'u1',
        'quota.conversion_window_hours'
      );
      expect(result).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringMatching(/^conversion:window:user:u1:/),
        '10',
        String(2 * 3600 + 300)
      );
    });

    it('should return false when the window limit is exceeded', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);

      const result = await engine.tryReserveConversionCount('u1');

      expect(result).toBe(false);
    });

    it('should return true without calling eval when the limit is unlimited', async () => {
      membershipService.getQuota.mockResolvedValueOnce(0);

      const result = await engine.tryReserveConversionCount('u1');

      expect(result).toBe(true);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  describe('reserveConversionCountOrThrow', () => {
    it('should throw QuotaExceededException when window limit reached', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);

      await expect(
        engine.reserveConversionCountOrThrow('u1')
      ).rejects.toBeInstanceOf(QuotaExceededException);
    });
  });

  describe('withConversionQuota（占位 → 执行 → 失败必释放单点包装）', () => {
    it('成功：占位被消耗（不释放），返回 fn 结果', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10) // 占位：窗口次数
        .mockResolvedValueOnce(2); // 占位：窗口小时
      redis.eval.mockResolvedValue(1);

      const result = await engine.withConversionQuota(
        { userId: 'u1' },
        async () => 'converted'
      );

      expect(result).toBe('converted');
      expect(redis.decr).not.toHaveBeenCalled();
    });

    it('fn 抛引擎原始异常：保证释放后原样上抛（precomputeExport 泄漏回归）', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10) // 占位：窗口次数
        .mockResolvedValueOnce(2) // 占位：窗口小时
        .mockResolvedValueOnce(2); // 释放：窗口小时
      redis.eval.mockResolvedValue(1);
      redis.get.mockResolvedValue('1');

      const boom = new Error('spawn failed');
      await expect(
        engine.withConversionQuota({ userId: 'u1' }, async () => {
          throw boom;
        })
      ).rejects.toBe(boom);

      expect(redis.decr).toHaveBeenCalledWith(
        expect.stringMatching(/^conversion:window:user:u1:/)
      );
    });

    it('占位失败（超限）：抛 QuotaExceededException，fn 不执行、不释放', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);

      const fn = jest.fn().mockResolvedValue('never');
      await expect(
        engine.withConversionQuota({ userId: 'u1' }, fn)
      ).rejects.toBeInstanceOf(QuotaExceededException);

      expect(fn).not.toHaveBeenCalled();
      expect(redis.decr).not.toHaveBeenCalled();
    });

    it('游客主体（ip）：占位/释放走 IP 窗口', async () => {
      runtimeConfigService.getValue
        .mockResolvedValueOnce(5) // 占位：游客限制
        .mockResolvedValueOnce(2) // 占位：游客窗口小时
        .mockResolvedValueOnce(2); // 释放：游客窗口小时
      redis.eval.mockResolvedValue(1);
      redis.get.mockResolvedValue('1');

      await expect(
        engine.withConversionQuota({ ip: '1.2.3.4' }, async () => {
          throw new Error('engine down');
        })
      ).rejects.toThrow('engine down');

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringMatching(/^conversion:window:ip:1\.2\.3\.4:/),
        '5',
        String(2 * 3600 + 300)
      );
      expect(redis.decr).toHaveBeenCalledWith(
        expect.stringMatching(/^conversion:window:ip:1\.2\.3\.4:/)
      );
    });

    it('无主体（userId/ip 皆无）：不占位直接执行，失败也不释放', async () => {
      await expect(
        engine.withConversionQuota({}, async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      expect(redis.eval).not.toHaveBeenCalled();
      expect(redis.decr).not.toHaveBeenCalled();
    });

    it('释放自身失败：只告警，不掩盖原始错误', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(1);
      redis.get.mockResolvedValue('1');
      redis.decr.mockRejectedValue(new Error('redis down'));

      await expect(
        engine.withConversionQuota({ userId: 'u1' }, async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });
  });

  describe('tryReserveSaveCount', () => {
    it('should reserve with save_window_count and reuse conversion window hours', async () => {
      // 保存次数 300、窗口小时 2（复用转换窗口）
      membershipService.getQuota
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(1);

      const result = await engine.tryReserveSaveCount('u1');

      expect(membershipService.getQuota).toHaveBeenCalledWith(
        'u1',
        'quota.save_window_count'
      );
      expect(membershipService.getQuota).toHaveBeenCalledWith(
        'u1',
        'quota.conversion_window_hours'
      );
      expect(result).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringMatching(/^save:window:user:u1:/),
        '300',
        String(2 * 3600 + 300)
      );
    });

    it('should return false when save limit is exceeded', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);

      const result = await engine.tryReserveSaveCount('u1');

      expect(result).toBe(false);
    });

    it('should return true without calling eval when limit is unlimited', async () => {
      membershipService.getQuota.mockResolvedValueOnce(0);

      const result = await engine.tryReserveSaveCount('u1');

      expect(result).toBe(true);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  describe('reserveSaveCountOrThrow', () => {
    it('should throw QuotaExceededException when save limit reached', async () => {
      membershipService.getQuota
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);

      await expect(
        engine.reserveSaveCountOrThrow('u1')
      ).rejects.toBeInstanceOf(QuotaExceededException);
    });
  });

  describe('releaseSaveCount', () => {
    it('should decrement save counter when key exists', async () => {
      membershipService.getQuota.mockResolvedValueOnce(2);
      redis.get.mockResolvedValue('5');

      await engine.releaseSaveCount('u1');

      expect(redis.decr).toHaveBeenCalledWith(
        expect.stringMatching(/^save:window:user:u1:/)
      );
    });

    it('should skip decrement when key missing', async () => {
      membershipService.getQuota.mockResolvedValueOnce(2);
      redis.get.mockResolvedValue(null);

      await engine.releaseSaveCount('u1');

      expect(redis.decr).not.toHaveBeenCalled();
    });
  });

  describe('history conversion quota (bin→mxweb)', () => {
    describe('tryReserveHistoryCount', () => {
      it('should reserve with history_window_count and reuse conversion window hours', async () => {
        // 历史版本查看次数 300、窗口小时 2（复用转换窗口）
        membershipService.getQuota
          .mockResolvedValueOnce(300)
          .mockResolvedValueOnce(2);
        redis.eval.mockResolvedValue(1);

        const result = await engine.tryReserveHistoryCount('u1');

        expect(membershipService.getQuota).toHaveBeenCalledWith(
          'u1',
          'quota.history_window_count'
        );
        expect(membershipService.getQuota).toHaveBeenCalledWith(
          'u1',
          'quota.conversion_window_hours'
        );
        expect(result).toBe(true);
      });

      it('should return false when history limit is exceeded', async () => {
        membershipService.getQuota
          .mockResolvedValueOnce(300)
          .mockResolvedValueOnce(2);
        redis.eval.mockResolvedValue(0);

        const result = await engine.tryReserveHistoryCount('u1');

        expect(result).toBe(false);
      });

      it('should return true without calling eval when limit is unlimited', async () => {
        membershipService.getQuota.mockResolvedValueOnce(0);

        const result = await engine.tryReserveHistoryCount('u1');

        expect(result).toBe(true);
        expect(redis.eval).not.toHaveBeenCalled();
      });
    });

    describe('reserveHistoryCountOrThrow', () => {
      it('should throw QuotaExceededException when history limit reached', async () => {
        membershipService.getQuota
          .mockResolvedValueOnce(300)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(300)
          .mockResolvedValueOnce(2);
        redis.eval.mockResolvedValue(0);

        await expect(
          engine.reserveHistoryCountOrThrow('u1')
        ).rejects.toBeInstanceOf(QuotaExceededException);
      });
    });

    describe('releaseHistoryCount', () => {
      it('should decrement history counter when key exists', async () => {
        membershipService.getQuota.mockResolvedValueOnce(2);
        redis.get.mockResolvedValue('5');

        await engine.releaseHistoryCount('u1');

        expect(redis.decr).toHaveBeenCalledWith(
          expect.stringMatching(/^history:window:user:u1:/)
        );
      });

      it('should skip decrement when key missing', async () => {
        membershipService.getQuota.mockResolvedValueOnce(2);
        redis.get.mockResolvedValue(null);

        await engine.releaseHistoryCount('u1');

        expect(redis.decr).not.toHaveBeenCalled();
      });
    });
  });

  describe('guest conversion reservation (by IP)', () => {
    it('should reserve using runtime config values', async () => {
      runtimeConfigService.getValue
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(1);

      const result = await engine.tryReserveGuestConversionCount('1.2.3.4');

      expect(runtimeConfigService.getValue).toHaveBeenCalledWith(
        'conversionGuestLimit',
        5
      );
      expect(runtimeConfigService.getValue).toHaveBeenCalledWith(
        'conversionGuestWindowHours',
        2
      );
      expect(result).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringMatching(/^conversion:window:ip:1\.2\.3\.4:/),
        '5',
        String(2 * 3600 + 300)
      );
    });

    it('should throw QuotaExceededException when guest limit reached', async () => {
      runtimeConfigService.getValue
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);
      redis.get.mockResolvedValue('5');

      await expect(
        engine.reserveGuestConversionCountOrThrow('1.2.3.4')
      ).rejects.toBeInstanceOf(QuotaExceededException);
    });

    it('should log the guest IP when the limit is reached', async () => {
      const logger = engine as unknown as {
        logger: { warn: (...args: unknown[]) => void };
      };
      const warnSpy = jest
        .spyOn(logger.logger, 'warn')
        .mockImplementation(() => undefined);
      runtimeConfigService.getValue
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      redis.eval.mockResolvedValue(0);
      redis.get.mockResolvedValue('5');

      const result = await engine.tryReserveGuestConversionCount('1.2.3.4');

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ip=1.2.3.4')
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
      warnSpy.mockRestore();
    });
  });

  describe('releaseConversionCount', () => {
    it('should decrement the conversion counter when key exists', async () => {
      membershipService.getQuota.mockResolvedValueOnce(2);
      redis.get.mockResolvedValue('3');
      redis.decr.mockResolvedValue(2);

      await engine.releaseConversionCount('user-1');

      expect(redis.decr).toHaveBeenCalledWith(
        expect.stringMatching(/^conversion:window:user:user-1:/)
      );
    });

    it('should skip decrement when key missing (window config changed)', async () => {
      membershipService.getQuota.mockResolvedValueOnce(2);
      redis.get.mockResolvedValue(null);

      await engine.releaseConversionCount('user-1');

      expect(redis.decr).not.toHaveBeenCalled();
    });
  });

  describe('assertExportDownloadAllowed', () => {
    it('should allow VIP users regardless of runtime switch', async () => {
      membershipService.getEffectiveMembership.mockResolvedValue({
        tierLevel: 2,
        configs: {},
      });
      await expect(engine.assertExportDownloadAllowed('vip-user')).resolves.toBeUndefined();
      expect(runtimeConfigService.getValue).not.toHaveBeenCalled();
    });

    it('should reject non-VIP user when runtime switch is off', async () => {
      membershipService.getEffectiveMembership.mockResolvedValue({
        tierLevel: 0,
        configs: {},
      });
      runtimeConfigService.getValue.mockResolvedValueOnce(false);
      await expect(engine.assertExportDownloadAllowed('free-user')).rejects.toMatchObject({
        name: 'VipFeatureRequiredException',
      });
    });

    it('should allow non-VIP user when runtime switch is on', async () => {
      membershipService.getEffectiveMembership.mockResolvedValue({
        tierLevel: 0,
        configs: {},
      });
      runtimeConfigService.getValue.mockResolvedValueOnce(true);
      await expect(engine.assertExportDownloadAllowed('free-user')).resolves.toBeUndefined();
    });

    it('should reject guest (no userId) when runtime switch is off', async () => {
      runtimeConfigService.getValue.mockResolvedValueOnce(false);
      await expect(engine.assertExportDownloadAllowed()).rejects.toMatchObject({
        name: 'VipFeatureRequiredException',
      });
    });

    it('should allow guest (no userId) when runtime switch is on', async () => {
      runtimeConfigService.getValue.mockResolvedValueOnce(true);
      await expect(engine.assertExportDownloadAllowed()).resolves.toBeUndefined();
    });
  });

  describe('releaseGuestConversionCount', () => {
    it('should decrement the guest counter when key exists', async () => {
      runtimeConfigService.getValue.mockResolvedValueOnce(2);
      redis.get.mockResolvedValue('1');
      redis.decr.mockResolvedValue(0);

      await engine.releaseGuestConversionCount('1.2.3.4');

      expect(redis.decr).toHaveBeenCalledWith(
        expect.stringMatching(/^conversion:window:ip:1\.2\.3\.4:/)
      );
    });
  });
});
