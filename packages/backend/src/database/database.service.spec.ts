import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
  })),
}));

// Mock PrismaPg adapter
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://test:test@localhost:5432/test';
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create PrismaClient with adapter', () => {
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });
    expect(PrismaClient).toHaveBeenCalledWith({
      log: ['query', 'info', 'warn', 'error'],
      adapter: {},
    });
  });

  describe('onModuleInit', () => {
    it('should connect to database', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.onModuleInit();

      expect(service.$connect).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('数据库连接成功');
      
      consoleSpy.mockRestore();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      (service.$connect as jest.Mock).mockRejectedValueOnce(error);

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from database', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.onModuleDestroy();

      expect(service.$disconnect).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('数据库连接已断开');
      
      consoleSpy.mockRestore();
    });

    it('should handle disconnection errors', async () => {
      const error = new Error('Disconnection failed');
      (service.$disconnect as jest.Mock).mockRejectedValueOnce(error);

      await expect(service.onModuleDestroy()).rejects.toThrow('Disconnection failed');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const result = await service.healthCheck();

      expect(service.$queryRaw).toHaveBeenCalledWith`SELECT 1`;
      expect(result).toEqual({
        status: 'healthy',
        message: '数据库连接正常',
      });
    });

    it('should return unhealthy status when database is not accessible', async () => {
      const error = new Error('Database connection failed');
      (service.$queryRaw as jest.Mock).mockRejectedValueOnce(error);

      const result = await service.healthCheck();

      expect(result).toEqual({
        status: 'unhealthy',
        message: '数据库连接失败',
        error: 'Database connection failed',
      });
    });
  });
});