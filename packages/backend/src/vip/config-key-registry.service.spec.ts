import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { ConfigKeyRegistryService } from './config-key-registry.service';

describe('ConfigKeyRegistryService', () => {
  let service: ConfigKeyRegistryService;

  const mockEntry = {
    id: 'key-1',
    key: 'quota.personal_storage_mb',
    type: 'number',
    label: '个人空间容量(MB)',
    defaultValue: 50,
    description: '用户个人私人空间的上限',
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    configKeyRegistry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigKeyRegistryService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConfigKeyRegistryService>(ConfigKeyRegistryService);
  });

  describe('create', () => {
    it('should create a new config key', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(null);
      mockPrisma.configKeyRegistry.create.mockResolvedValue(mockEntry);

      const result = await service.create({
        key: 'quota.personal_storage_mb',
        type: 'number',
        label: '个人空间容量(MB)',
      });
      expect(result.key).toBe('quota.personal_storage_mb');
      expect(result.type).toBe('number');
    });

    it('should reject duplicate key', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(mockEntry);
      await expect(service.create({ key: 'quota.personal_storage_mb', type: 'number', label: 'test' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all config keys', async () => {
      mockPrisma.configKeyRegistry.findMany.mockResolvedValue([mockEntry]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return entry when found', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(mockEntry);
      const result = await service.findById('key-1');
      expect(result.key).toBe('quota.personal_storage_mb');
    });

    it('should throw when not found', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByKey', () => {
    it('should return entry by key name', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(mockEntry);
      const result = await service.findByKey('quota.personal_storage_mb');
      expect(result.label).toBe('个人空间容量(MB)');
    });

    it('should throw when key not found', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(null);
      await expect(service.findByKey('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update entry fields', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.configKeyRegistry.update.mockResolvedValue({ ...mockEntry, label: '新名称' });
      const result = await service.update('key-1', { label: '新名称' });
      expect(result.label).toBe('新名称');
    });

    it('should throw on nonexistent entry', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', { label: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete entry', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.configKeyRegistry.delete.mockResolvedValue(mockEntry);
      await expect(service.remove('key-1')).resolves.toBeUndefined();
    });

    it('should throw on nonexistent entry', async () => {
      mockPrisma.configKeyRegistry.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
