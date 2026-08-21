import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { DurationPricingService } from './duration-pricing.service';

describe('DurationPricingService', () => {
  let service: DurationPricingService;

  const mockPricing = {
    id: 'dur-1',
    months: 3,
    multiplierBps: 9000,
    label: '3个月',
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
  };

  const mockPrisma = {
    durationPricing: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DurationPricingService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DurationPricingService>(DurationPricingService);
  });

  describe('create', () => {
    it('should create a new duration pricing', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(null);
      mockPrisma.durationPricing.create.mockResolvedValue(mockPricing);

      const result = await service.create({ months: 3, multiplierBps: 9000, label: '3个月' });
      expect(result.months).toBe(3);
      expect(result.multiplier).toBe(0.9);
    });

    it('should reject duplicate months', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(mockPricing);
      await expect(service.create({ months: 3, multiplierBps: 9000, label: '3个月' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all pricings', async () => {
      mockPrisma.durationPricing.findMany.mockResolvedValue([mockPricing]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findActive', () => {
    it('should return only active pricings', async () => {
      mockPrisma.durationPricing.findMany.mockResolvedValue([mockPricing]);
      const result = await service.findActive();
      expect(result).toHaveLength(1);
      expect(mockPrisma.durationPricing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findById', () => {
    it('should return pricing when found', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(mockPricing);
      const result = await service.findById('dur-1');
      expect(result.label).toBe('3个月');
    });

    it('should throw when not found', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update pricing fields', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(mockPricing);
      mockPrisma.durationPricing.update.mockResolvedValue({ ...mockPricing, label: '6个月', months: 6 });
      const result = await service.update('dur-1', { months: 6, label: '6个月' });
      expect(result.label).toBe('6个月');
    });

    it('should reject duplicate months on update', async () => {
      mockPrisma.durationPricing.findUnique
        .mockResolvedValueOnce(mockPricing)  // first call: find existing
        .mockResolvedValueOnce({ ...mockPricing, id: 'dur-2', months: 6 });  // second call: find conflict
      await expect(service.update('dur-1', { months: 6 })).rejects.toThrow(ConflictException);
    });

    it('should throw on nonexistent pricing', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', { label: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should soft-delete pricing', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(mockPricing);
      mockPrisma.durationPricing.update.mockResolvedValue({ ...mockPricing, isActive: false });
      const result = await service.deactivate('dur-1');
      expect(result.isActive).toBe(false);
    });

    it('should throw on nonexistent', async () => {
      mockPrisma.durationPricing.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
