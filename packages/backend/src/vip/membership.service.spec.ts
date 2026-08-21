import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { MembershipService } from './membership.service';

describe('MembershipService', () => {
  let service: MembershipService;

  const mockPrisma = {
    userMembership: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    vipTier: {
      findUnique: jest.fn(),
    },
    configKeyRegistry: {
      findMany: jest.fn(),
    },
  };

  const mockTx: any = {
    userMembership: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    vipTier: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MembershipService>(MembershipService);
  });

  describe('activate', () => {
    const vipTier = { level: 1, baseMonthlyPrice: 1500 };
    const durationDays30 = 30;
    const durationDays60 = 60;

    it('should create new membership when no existing record', async () => {
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      const now = Date.now();

      mockTx.userMembership.upsert.mockImplementation(
        async ({ create }) => create
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      expect(mockTx.userMembership.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          userId: 'user-1',
          tierLevel: 1,
          expiresAt: expect.any(Date),
        }),
        update: expect.any(Object),
      });

      const expiresAt =
        mockTx.userMembership.upsert.mock.calls[0][0].create.expiresAt.getTime();
      expect(expiresAt - now).toBeGreaterThan(29.5 * 86400000);
      expect(expiresAt - now).toBeLessThan(30.5 * 86400000);
    });

    it('should extend existing membership when still active', async () => {
      const future = new Date(Date.now() + 10 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: future,
      });

      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - future.getTime()).toBeGreaterThan(29.5 * 86400000);
      expect(newExpiry - future.getTime()).toBeLessThan(30.5 * 86400000);
    });

    it('should start from now when membership expired', async () => {
      const past = new Date(Date.now() - 5 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: past,
      });

      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      const now = Date.now();
      expect(newExpiry - now).toBeGreaterThan(29.5 * 86400000);
      expect(newExpiry - now).toBeLessThan(30.5 * 86400000);
    });

    it('should keep higher tier level when reactivating with same level', async () => {
      const future = new Date(Date.now() + 10 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: future,
      });

      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      expect(updateCall.update.tierLevel).toBe(2);
    });

    it('should not inherit higher tier from an expired membership', async () => {
      const past = new Date(Date.now() - 5 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: past,
      });

      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      expect(updateCall.update.tierLevel).toBe(1);
    });

    it('should keep permanent membership permanent when purchasing a lower tier', async () => {
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
      });

      mockTx.userMembership.update.mockImplementation(async ({ data }) => ({
        userId: 'user-1',
        tierLevel: data.tierLevel,
        expiresAt: null,
      }));
      await service.activate(mockTx, 'user-1', vipTier, durationDays30);

      expect(mockTx.userMembership.upsert).not.toHaveBeenCalled();
      expect(mockTx.userMembership.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { tierLevel: 2 },
      });
    });

    it('should keep permanent membership permanent when upgrading tier', async () => {
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
      });

      mockTx.userMembership.update.mockImplementation(async ({ data }) => ({
        userId: 'user-1',
        tierLevel: data.tierLevel,
        expiresAt: null,
      }));
      await service.activate(
        mockTx,
        'user-1',
        { level: 3, baseMonthlyPrice: 6000 },
        durationDays30
      );

      expect(mockTx.userMembership.upsert).not.toHaveBeenCalled();
      expect(mockTx.userMembership.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { tierLevel: 3 },
      });
    });

    it('should accumulate multiple renewals', async () => {
      const future = new Date(Date.now() + 10 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: future,
      });

      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );
      await service.activate(mockTx, 'user-1', vipTier, durationDays60);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - Date.now()).toBeGreaterThan(69 * 86400000);
      expect(newExpiry - Date.now()).toBeLessThan(71 * 86400000);
    });
  });

  describe('activate (upgrade proration, moved from billing)', () => {
    const durationDays30 = 30;

    it('should add prorated extra days when upgrading to higher tier', async () => {
      // 旧等级 VIP1(1500) 剩余 60 天 → 升 VIP2(3000)：
      // extraDays = floor(60 × 1500 / 3000) = 30，effectiveDays = 30 + 30 = 60
      const existing = {
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 60 * 86400000),
      };
      mockTx.userMembership.findUnique.mockResolvedValue(existing);
      mockTx.vipTier.findUnique.mockResolvedValue({
        level: 1,
        baseMonthlyPrice: 1500,
      });
      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );

      await service.activate(
        mockTx,
        'user-1',
        { level: 2, baseMonthlyPrice: 3000 },
        durationDays30
      );

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      expect(updateCall.update.tierLevel).toBe(2);
      expect(mockTx.vipTier.findUnique).toHaveBeenCalledWith({
        where: { level: 1 },
      });
      // 续期基线 = 现有 expiresAt（60 天后），折算后 effectiveDays = 30 + 30 = 60
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - existing.expiresAt.getTime()).toBeGreaterThan(
        59.5 * 86400000
      );
      expect(newExpiry - existing.expiresAt.getTime()).toBeLessThan(
        60.5 * 86400000
      );
    });

    it('should not query old tier price on same-tier renewal', async () => {
      const existing = {
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      };
      mockTx.userMembership.findUnique.mockResolvedValue(existing);
      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );

      await service.activate(
        mockTx,
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      expect(updateCall.update.expiresAt.getTime() - existing.expiresAt.getTime())
        .toBeGreaterThan(29.5 * 86400000);
      expect(mockTx.vipTier.findUnique).not.toHaveBeenCalled();
    });

    it('should not add extra days when upgrading from expired membership', async () => {
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() - 10 * 86400000),
      });
      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );

      await service.activate(
        mockTx,
        'user-1',
        { level: 2, baseMonthlyPrice: 3000 },
        90
      );

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - Date.now()).toBeGreaterThan(89 * 86400000);
      expect(newExpiry - Date.now()).toBeLessThan(91 * 86400000);
      expect(mockTx.vipTier.findUnique).not.toHaveBeenCalled();
    });

    it('should not add extra days when old tier price is not found', async () => {
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
      mockTx.vipTier.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );

      await service.activate(
        mockTx,
        'user-1',
        { level: 2, baseMonthlyPrice: 3000 },
        90
      );

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      expect(updateCall.update.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        119 * 86400000
      );
      expect(updateCall.update.expiresAt.getTime() - Date.now()).toBeLessThan(
        121 * 86400000
      );
    });

    it('should not produce Infinity/Invalid Date when new tier price is zero', async () => {
      // 新档位 baseMonthlyPrice=0 时，若未走防除零守卫，剩余天数折算 = floor(60×1500/0) = Infinity
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 60 * 86400000),
      });
      mockTx.userMembership.upsert.mockImplementation(
        async ({ update }) => update
      );

      await service.activate(
        mockTx,
        'user-1',
        { level: 2, baseMonthlyPrice: 0 },
        90
      );

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(Number.isFinite(newExpiry)).toBe(true);
      expect(newExpiry - Date.now()).toBeGreaterThan(149 * 86400000);
      expect(newExpiry - Date.now()).toBeLessThan(151 * 86400000);
      expect(mockTx.vipTier.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('recalculateFromOrders (moved from billing)', () => {
    const day = 86400000;
    const now = Date.now();

    it('should set FREE when no remaining orders', async () => {
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', []);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', expiresAt: null, tierLevel: 0 },
        update: { expiresAt: null, tierLevel: 0 },
      });
    });

    it('should keep membership unchanged when valid external watermark exists', async () => {
      const upsertMock = jest.fn();
      const externalMembership = {
        id: 'mem-1',
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: new Date(now + 30 * day),
        metadata: {
          externalVipExpiresAt: new Date(now + 60 * day).toISOString(),
        },
      };
      mockTx.userMembership.findUnique.mockResolvedValue(externalMembership);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', []);

      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('should still reset FREE when external watermark already expired', async () => {
      const upsertMock = jest.fn();
      const externalMembership = {
        id: 'mem-1',
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
        metadata: {
          externalVipExpiresAt: new Date(now - 60 * day).toISOString(),
        },
      };
      mockTx.userMembership.findUnique.mockResolvedValue(externalMembership);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', []);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', expiresAt: null, tierLevel: 0 },
        update: { expiresAt: null, tierLevel: 0 },
      });
    });

    it('should zero expired orders instead of inheriting stale tier level', async () => {
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 2, months: 1, paidAt: new Date(now - 90 * day) },
      ]);

      expect(upsertMock).toHaveBeenCalled();
      const upsertArg = upsertMock.mock.calls[0][0];
      expect(upsertArg.update.tierLevel).toBe(0);
      // 全过期清零：expiresAt 取重算时刻的 now（允许 ms 级误差）
      const resetAt = upsertArg.update.expiresAt.getTime();
      expect(resetAt).toBeGreaterThan(now - 5000);
      expect(resetAt).toBeLessThanOrEqual(now + 5000);
    });

    it('should accumulate remaining orders by paidAt cursor', async () => {
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 1, months: 1, paidAt: new Date(now + 10 * day) },
        { vipTierLevel: 1, months: 2, paidAt: new Date(now + 40 * day) },
      ]);

      expect(upsertMock).toHaveBeenCalled();
      const upsertArg = upsertMock.mock.calls[0][0];
      expect(upsertArg.update.tierLevel).toBe(1);
      const expected = now + 100 * day;
      expect(upsertArg.update.expiresAt.getTime()).toBeGreaterThan(
        expected - 5000
      );
      expect(upsertArg.update.expiresAt.getTime()).toBeLessThan(
        expected + 5000
      );
    });

    it('should sort by paidAt before stacking (order matters)', async () => {
      // 乱序输入 [B(40d, 1月), A(10d, 1月)]：正确排序后 = 10+30=40 → max(40,40)+30=70
      // 若不排序：40+30=70 → max(70,10)+30=100（错误）
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 1, months: 1, paidAt: new Date(now + 40 * day) },
        { vipTierLevel: 1, months: 1, paidAt: new Date(now + 10 * day) },
      ]);

      const upsertArg = upsertMock.mock.calls[0][0];
      const expected = now + 70 * day;
      expect(upsertArg.update.expiresAt.getTime()).toBeGreaterThan(
        expected - 5000
      );
      expect(upsertArg.update.expiresAt.getTime()).toBeLessThan(
        expected + 5000
      );
    });

    it('should take maxTier across mixed-level orders', async () => {
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 1, months: 1, paidAt: new Date(now + 10 * day) },
        { vipTierLevel: 3, months: 1, paidAt: new Date(now + 20 * day) },
        { vipTierLevel: 2, months: 1, paidAt: new Date(now + 30 * day) },
      ]);

      const upsertArg = upsertMock.mock.calls[0][0];
      expect(upsertArg.update.tierLevel).toBe(3);
    });

    it('should keep maxTier contribution of paidAt-null order without advancing cursor', async () => {
      const upsertMock = jest.fn();
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 2, months: 1, paidAt: null },
        { vipTierLevel: 1, months: 1, paidAt: new Date(now + 10 * day) },
      ]);

      const upsertArg = upsertMock.mock.calls[0][0];
      // maxTier 来自 paidAt 缺失行（语义保留），游标只推进 30 天
      expect(upsertArg.update.tierLevel).toBe(2);
      const expected = now + 40 * day;
      expect(upsertArg.update.expiresAt.getTime()).toBeGreaterThan(
        expected - 5000
      );
      expect(upsertArg.update.expiresAt.getTime()).toBeLessThan(
        expected + 5000
      );
    });

    it('should keep membership unchanged when external watermark valid even if orders expired', async () => {
      const upsertMock = jest.fn();
      const externalMembership = {
        id: 'mem-1',
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: new Date(now + 30 * day),
        metadata: {
          externalVipExpiresAt: new Date(now + 60 * day).toISOString(),
        },
      };
      mockTx.userMembership.findUnique.mockResolvedValue(externalMembership);
      mockTx.userMembership.upsert.mockImplementation(upsertMock);

      await service.recalculateFromOrders(mockTx, 'user-1', [
        { vipTierLevel: 1, months: 1, paidAt: new Date(now - 90 * day) },
      ]);

      expect(upsertMock).not.toHaveBeenCalled();
    });
  });

  describe('getMembership', () => {
    it('should return tierLevel 0 when no membership record exists', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      const result = await service.getMembership('nonexistent-user');
      expect(result.tierLevel).toBe(0);
      expect(result.daysRemaining).toBe(0);
      expect(result.expiresAt).toBeNull();
    });

    it('should return tierLevel 0 when membership is expired', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: yesterday,
      });
      const result = await service.getMembership('user-1');
      expect(result.tierLevel).toBe(0);
      expect(result.daysRemaining).toBe(0);
    });

    it('should return active tierLevel with days remaining', async () => {
      const future = new Date(Date.now() + 15 * 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: future,
      });
      const result = await service.getMembership('user-1');
      expect(result.tierLevel).toBe(1);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.expiresAt).toBe(future);
    });

    it('should return active tierLevel with Infinity days for permanent membership', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
      });
      const result = await service.getMembership('user-1');
      expect(result.tierLevel).toBe(2);
      expect(result.daysRemaining).toBe(Number.POSITIVE_INFINITY);
      expect(result.expiresAt).toBeNull();
    });

    it('should return tierLevel 0 for expired membership without expiresAt', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 0,
        expiresAt: null,
      });
      const result = await service.getMembership('user-1');
      expect(result.tierLevel).toBe(0);
      expect(result.daysRemaining).toBe(0);
      expect(result.expiresAt).toBeNull();
    });
  });

  describe('getEffectiveMembership', () => {
    const defaultRegistry = [
      { key: 'quota.personal_storage_mb', defaultValue: 50 },
      { key: 'quota.project_size_mb', defaultValue: 100 },
      { key: 'quota.conversion_window_count', defaultValue: 10 },
      { key: 'quota.max_projects', defaultValue: 5 },
    ];

    it('should return VIP0 with registry defaults when no record exists', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue(defaultRegistry);

      const result = await service.getEffectiveMembership('nonexistent-user');

      expect(result.tierLevel).toBe(0);
      expect(result.configs).toEqual({
        'quota.personal_storage_mb': 50,
        'quota.project_size_mb': 100,
        'quota.conversion_window_count': 10,
        'quota.max_projects': 5,
      });
    });

    it('should return VIP0 when membership is expired', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: new Date(Date.now() - 86400000),
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue(defaultRegistry);

      const result = await service.getEffectiveMembership('user-1');

      expect(result.tierLevel).toBe(0);
    });

    it('should return active tier with tier configs overriding registry defaults', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 1,
        configs: { 'quota.personal_storage_mb': 200, 'quota.max_projects': 20 },
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue(defaultRegistry);

      const result = await service.getEffectiveMembership('user-1');

      expect(result.tierLevel).toBe(1);
      expect(result.configs).toEqual({
        'quota.personal_storage_mb': 200,
        'quota.project_size_mb': 100,
        'quota.conversion_window_count': 10,
        'quota.max_projects': 20,
      });
    });

    it('should query vipTier by effective level', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 3,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 3,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue(defaultRegistry);

      await service.getEffectiveMembership('user-1');

      expect(mockPrisma.vipTier.findUnique).toHaveBeenCalledWith({
        where: { level: 3 },
      });
    });

    it('should fall back to registry defaults when tier has no configs', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue(defaultRegistry);

      const result = await service.getEffectiveMembership('user-1');

      expect(result.tierLevel).toBe(2);
      expect(result.configs['quota.personal_storage_mb']).toBe(50);
    });
  });

  describe('getEffectiveTier', () => {
    it('should return 0 when no record exists', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);
      const result = await service.getEffectiveTier('nonexistent-user');
      expect(result).toBe(0);
    });

    it('should return 0 when expired', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() - 86400000),
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);
      const result = await service.getEffectiveTier('user-1');
      expect(result).toBe(0);
    });

    it('should return stored tierLevel when active', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 2,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);
      const result = await service.getEffectiveTier('user-1');
      expect(result).toBe(2);
    });

    it('should return stored tierLevel for permanent membership', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 2,
        expiresAt: null,
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 2,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);
      const result = await service.getEffectiveTier('user-1');
      expect(result).toBe(2);
    });
  });

  describe('getQuota', () => {
    it('should return tier config value when present', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 1,
        configs: { 'quota.personal_storage_mb': 200 },
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);

      const result = await service.getQuota(
        'user-1',
        'quota.personal_storage_mb'
      );
      expect(result).toBe(200);
    });

    it('should fall back to registry default when tier misses the key', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 1,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([
        { key: 'quota.personal_storage_mb', defaultValue: 50 },
      ]);

      const result = await service.getQuota(
        'user-1',
        'quota.personal_storage_mb'
      );
      expect(result).toBe(50);
    });

    it('should return 0 when key has no default anywhere', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 1,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([]);

      const result = await service.getQuota('user-1', 'quota.unknown_key');
      expect(result).toBe(0);
    });

    it('should return registry default for non-member user', async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      mockPrisma.vipTier.findUnique.mockResolvedValue({
        level: 0,
        configs: {},
      });
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([
        { key: 'quota.project_size_mb', defaultValue: 100 },
      ]);

      const result = await service.getQuota(
        'nonexistent-user',
        'quota.project_size_mb'
      );
      expect(result).toBe(100);
    });
  });
});
