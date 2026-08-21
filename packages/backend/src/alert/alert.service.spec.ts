import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { AlertService } from './alert.service';
import { AlertLevel, AlertStatus } from './enums/alert.enum';

describe('AlertService', () => {
  let service: AlertService;

  const mockPrisma = {
    alertRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const baseInput = {
    source: 'disk-monitor',
    messageKey: 'disk_space_low',
    level: AlertLevel.WARNING,
    message: '磁盘剩余空间不足',
    detail: { free: '12.3GB', total: '100GB', path: 'D:' },
  };

  const openRecord = {
    id: 'alert-1',
    source: 'disk-monitor',
    messageKey: 'disk_space_low',
    level: AlertLevel.WARNING,
    message: '磁盘剩余空间不足',
    detail: { free: '15GB', total: '100GB', path: 'D:' },
    status: AlertStatus.OPEN,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // 默认 $transaction 直接执行回调（传入 mockPrisma 作为 tx）
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma)
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  // ==================== raise ====================
  describe('raise', () => {
    it('should create a new alert when no OPEN record exists', async () => {
      mockPrisma.alertRecord.findFirst.mockResolvedValue(null);
      mockPrisma.alertRecord.create.mockResolvedValue(openRecord);

      const result = await service.raise(baseInput);

      expect(mockPrisma.alertRecord.findFirst).toHaveBeenCalledWith({
        where: {
          source: 'disk-monitor',
          messageKey: 'disk_space_low',
          status: AlertStatus.OPEN,
        },
      });
      expect(mockPrisma.alertRecord.create).toHaveBeenCalledWith({
        data: {
          source: 'disk-monitor',
          messageKey: 'disk_space_low',
          level: AlertLevel.WARNING,
          message: '磁盘剩余空间不足',
          detail: { free: '12.3GB', total: '100GB', path: 'D:' },
        },
      });
      expect(result).toEqual(openRecord);
    });

    it('should update existing OPEN record with latest message/detail', async () => {
      mockPrisma.alertRecord.findFirst.mockResolvedValue(openRecord);
      const updated = { ...openRecord, detail: baseInput.detail };
      mockPrisma.alertRecord.update.mockResolvedValue(updated);

      const result = await service.raise(baseInput);

      expect(mockPrisma.alertRecord.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: {
          level: AlertLevel.WARNING,
          message: '磁盘剩余空间不足',
          detail: { free: '12.3GB', total: '100GB', path: 'D:' },
        },
      });
      expect(mockPrisma.alertRecord.create).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should fall back to update on P2002 concurrent race', async () => {
      // 事务内 create 抛 P2002 → 事务回滚 → 事务外重新查询并 update
      mockPrisma.alertRecord.findFirst
        .mockResolvedValueOnce(null) // 事务内：未命中
        .mockResolvedValueOnce(openRecord); // 兜底：已存在
      const p2002 = new PrismaRuntime.PrismaClientKnownRequestError(
        'unique constraint failed',
        { code: 'P2002', clientVersion: '7.8.0' }
      );
      mockPrisma.alertRecord.create.mockRejectedValue(p2002);
      const updated = { ...openRecord, detail: baseInput.detail };
      mockPrisma.alertRecord.update.mockResolvedValue(updated);

      const result = await service.raise(baseInput);

      expect(mockPrisma.alertRecord.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updated);
    });

    it('should rethrow non-P2002 errors', async () => {
      mockPrisma.alertRecord.findFirst.mockResolvedValue(null);
      mockPrisma.alertRecord.create.mockRejectedValue(new Error('DB down'));

      await expect(service.raise(baseInput)).rejects.toThrow('DB down');
    });
  });

  // ==================== resolveBySourceKey ====================
  describe('resolveBySourceKey', () => {
    it('should resolve all OPEN alerts for source+messageKey', async () => {
      mockPrisma.alertRecord.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.resolveBySourceKey(
        'disk-monitor',
        'disk_space_low'
      );

      expect(mockPrisma.alertRecord.updateMany).toHaveBeenCalledWith({
        where: {
          source: 'disk-monitor',
          messageKey: 'disk_space_low',
          status: AlertStatus.OPEN,
        },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: expect.any(Date),
        },
      });
      expect(result).toBe(2);
    });

    it('should return 0 when nothing to resolve', async () => {
      mockPrisma.alertRecord.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.resolveBySourceKey(
        'disk-monitor',
        'disk_space_low'
      );
      expect(result).toBe(0);
    });
  });

  // ==================== resolveById ====================
  describe('resolveById', () => {
    it('should resolve OPEN alert by id and return updated record', async () => {
      mockPrisma.alertRecord.updateMany.mockResolvedValue({ count: 1 });
      const resolved = {
        ...openRecord,
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      };
      mockPrisma.alertRecord.findUnique.mockResolvedValue(resolved);

      const result = await service.resolveById('alert-1');

      expect(mockPrisma.alertRecord.updateMany).toHaveBeenCalledWith({
        where: { id: 'alert-1', status: AlertStatus.OPEN },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.alertRecord.findUnique).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
      });
      expect(result).toEqual(resolved);
    });

    it('should return null when alert does not exist', async () => {
      mockPrisma.alertRecord.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.alertRecord.findUnique.mockResolvedValue(null);

      const result = await service.resolveById('missing');
      expect(result).toBeNull();
    });
  });

  // ==================== findAll ====================
  describe('findAll', () => {
    it('should query with default pagination and no filters', async () => {
      mockPrisma.alertRecord.findMany.mockResolvedValue([]);
      mockPrisma.alertRecord.count.mockResolvedValue(0);

      const result = await service.findAll({}, { page: 1, limit: 20 });

      expect(mockPrisma.alertRecord.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(mockPrisma.alertRecord.count).toHaveBeenCalledWith({
        where: {},
      });
      expect(result).toEqual({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it('should pass level/status/source filters into where', async () => {
      mockPrisma.alertRecord.findMany.mockResolvedValue([]);
      mockPrisma.alertRecord.count.mockResolvedValue(0);

      await service.findAll(
        {
          level: AlertLevel.CRITICAL,
          status: AlertStatus.OPEN,
          source: 'disk-monitor',
        },
        { page: 1, limit: 20 }
      );

      expect(mockPrisma.alertRecord.findMany).toHaveBeenCalledWith({
        where: {
          level: AlertLevel.CRITICAL,
          status: AlertStatus.OPEN,
          source: 'disk-monitor',
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('should compute skip from page/limit and return correct totalPages', async () => {
      const records = [openRecord];
      mockPrisma.alertRecord.findMany.mockResolvedValue(records);
      mockPrisma.alertRecord.count.mockResolvedValue(25);

      const result = await service.findAll({}, { page: 3, limit: 10 });

      expect(mockPrisma.alertRecord.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 10,
      });
      expect(result).toEqual({
        data: records,
        pagination: { page: 3, limit: 10, total: 25, totalPages: 3 },
      });
    });

    it('should fall back to defaults when pagination values are falsy', async () => {
      mockPrisma.alertRecord.findMany.mockResolvedValue([]);
      mockPrisma.alertRecord.count.mockResolvedValue(0);

      await service.findAll({}, { page: 0, limit: 0 });

      expect(mockPrisma.alertRecord.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });
});
