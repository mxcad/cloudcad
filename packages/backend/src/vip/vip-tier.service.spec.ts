import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { ConfigKeyRegistryService } from './config-key-registry.service';
import { VipTierService } from './vip-tier.service';

describe('VipTierService', () => {
  let service: VipTierService;

  const mockTier = {
    id: 'tier-1',
    level: 1,
    name: 'VIP1',
    baseMonthlyPrice: 1500,
    isActive: true,
    configs: { 'quota.personal_storage_mb': 200 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /** 系统固有免费等级（level 0），用于守卫用例 */
  const mockFreeTier = {
    ...mockTier,
    id: 'tier-0',
    level: 0,
    name: 'VIP0',
    baseMonthlyPrice: 0,
  };

  const mockPrisma = {
    vipTier: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    paymentOrder: {
      count: jest.fn(),
    },
  };

  const mockConfigKeyRegistryService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigKeyRegistryService.findAll.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VipTierService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ConfigKeyRegistryService, useValue: mockConfigKeyRegistryService },
      ],
    }).compile();

    service = module.get<VipTierService>(VipTierService);
  });

  describe('create', () => {
    it('should create a new tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      mockPrisma.vipTier.create.mockResolvedValue(mockTier);

      const result = await service.create({ level: 1, name: 'VIP1', baseMonthlyPrice: 1500 });
      expect(result.level).toBe(1);
      expect(result.baseMonthlyPriceYuan).toBe(15);
    });

    it('should reject duplicate level', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      await expect(service.create({ level: 1, name: 'VIP1', baseMonthlyPrice: 1500 })).rejects.toThrow(ConflictException);
    });

    it('should reject creating the system free tier (level 0)', async () => {
      await expect(
        service.create({ level: 0, name: 'VIP0', baseMonthlyPrice: 0 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.vipTier.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all tiers ordered by level', async () => {
      mockPrisma.vipTier.findMany.mockResolvedValue([mockTier]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findActive', () => {
    it('should return only active tiers', async () => {
      mockPrisma.vipTier.findMany.mockResolvedValue([mockTier]);
      const result = await service.findActive();
      expect(result).toHaveLength(1);
      expect(mockPrisma.vipTier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findById', () => {
    it('should return tier when found', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      const result = await service.findById('tier-1');
      expect(result.name).toBe('VIP1');
    });

    it('should throw when not found', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByLevel', () => {
    it('should return tier by level', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      const result = await service.findByLevel(1);
      expect(result.level).toBe(1);
    });

    it('should throw when level not found', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.findByLevel(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update tier fields', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockPrisma.vipTier.update.mockResolvedValue({ ...mockTier, name: 'VIP1-Plus' });
      const result = await service.update('tier-1', { name: 'VIP1-Plus' });
      expect(result.name).toBe('VIP1-Plus');
    });

    it('should throw when updating nonexistent tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('should reject changing locked fields of the free tier (level 0)', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockFreeTier);
      await expect(
        service.update('tier-0', { name: 'VIP0-改名' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('tier-0', { baseMonthlyPrice: 100 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('tier-0', { isActive: false }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.vipTier.update).not.toHaveBeenCalled();
    });

    it('should allow echoing back unchanged locked values of the free tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockFreeTier);
      mockPrisma.vipTier.update.mockResolvedValue(mockFreeTier);
      await expect(
        service.update('tier-0', {
          name: 'VIP0',
          baseMonthlyPrice: 0,
          isActive: true,
          configs: { 'quota.personal_storage_mb': 200 },
        }),
      ).resolves.toBeDefined();
      expect(mockPrisma.vipTier.update).toHaveBeenCalledTimes(1);
    });

    it('should allow configs-only update of the free tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockFreeTier);
      mockPrisma.vipTier.update.mockResolvedValue({
        ...mockFreeTier,
        configs: { 'quota.personal_storage_mb': 500 },
      });
      const result = await service.update('tier-0', {
        configs: { 'quota.personal_storage_mb': 500 },
      });
      expect(result.configs).toEqual({ 'quota.personal_storage_mb': 500 });
    });
  });

  describe('updateConfigs', () => {
    it('should update tier configs', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockPrisma.vipTier.update.mockResolvedValue({ ...mockTier, configs: { 'quota.personal_storage_mb': 500 } });
      const result = await service.updateConfigs('tier-1', { configs: { 'quota.personal_storage_mb': 500 } });
      expect(result.configs).toEqual({ 'quota.personal_storage_mb': 500 });
    });

    it('should reject null configs', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      await expect(service.updateConfigs('tier-1', { configs: null as unknown as Record<string, unknown> })).rejects.toThrow(BadRequestException);
    });

    it('should throw when tier not found', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.updateConfigs('nonexistent', { configs: { a: 1 } })).rejects.toThrow(NotFoundException);
    });

    it('should reject string value for a registered number key', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockConfigKeyRegistryService.findAll.mockResolvedValue([
        { key: 'quota.personal_storage_mb', type: 'number' },
      ]);
      await expect(
        service.updateConfigs('tier-1', { configs: { 'quota.personal_storage_mb': '200' } }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should soft-delete tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockPrisma.vipTier.update.mockResolvedValue({ ...mockTier, isActive: false });
      const result = await service.deactivate('tier-1');
      expect(result.isActive).toBe(false);
    });

    it('should throw on nonexistent tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject deactivating the system free tier (level 0)', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockFreeTier);
      await expect(service.deactivate('tier-0')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.vipTier.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should physically delete tier without orders', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockPrisma.paymentOrder.count.mockResolvedValue(0);
      const result = await service.remove('tier-1');
      expect(result).toEqual({ success: true });
      expect(mockPrisma.vipTier.delete).toHaveBeenCalledWith({ where: { id: 'tier-1' } });
    });

    it('should reject when tier has order references', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockTier);
      mockPrisma.paymentOrder.count.mockResolvedValue(2);
      await expect(service.remove('tier-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw on nonexistent tier', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject removing the system free tier (level 0)', async () => {
      mockPrisma.vipTier.findUnique.mockResolvedValue(mockFreeTier);
      await expect(service.remove('tier-0')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.vipTier.delete).not.toHaveBeenCalled();
    });
  });
});
