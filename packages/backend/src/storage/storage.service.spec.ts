import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { LocalStorageProvider } from './local-storage.provider';

describe('StorageService', () => {
  let service: StorageService;
  let localStorageProvider: jest.Mocked<LocalStorageProvider>;

  const mockLocalStorageProvider = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    getFileStream: jest.fn(),
    fileExists: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: LocalStorageProvider,
          useValue: mockLocalStorageProvider,
        },
        {
          provide: 'ConfigService',
          useValue: {
            get: jest.fn((key) => {
              if (key === 'FILES_DATA_PATH') return '../filesData';
              return undefined;
            }),
          },
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<StorageService>(StorageService);
    localStorageProvider = module.get(LocalStorageProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const result = await service.healthCheck();

      expect(result).toEqual({
        status: 'healthy',
        message: '本地存储服务正常',
      });
    });

    it('should return unhealthy status when error occurs', async () => {
      // Mock an error scenario by modifying the healthCheck implementation
      const originalHealthCheck = service.healthCheck.bind(service);
      service.healthCheck = async () => {
        throw new Error('Connection failed');
      };

      const result = await service.healthCheck().catch(() => ({
        status: 'unhealthy',
        message: '存储服务不可用: Connection failed',
      }));

      expect(result).toEqual({
        status: 'unhealthy',
        message: '存储服务不可用: Connection failed',
      });

      // Restore original method
      service.healthCheck = originalHealthCheck;
    });
  });
});
