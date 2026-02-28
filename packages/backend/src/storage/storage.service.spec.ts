import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'FILES_DATA_PATH') return '../filesData';
      if (key === 'FILES_NODE_LIMIT') return 1000;
      return undefined;
    }),
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
          provide: ConfigService,
          useValue: mockConfigService,
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

  it('should have localStorageProvider', () => {
    expect(localStorageProvider).toBeDefined();
  });

  describe('fileExists', () => {
    it('should call localStorageProvider.fileExists', async () => {
      mockLocalStorageProvider.fileExists.mockResolvedValue(true);

      const result = await service.fileExists('test.txt');

      expect(result).toBe(true);
      expect(mockLocalStorageProvider.fileExists).toHaveBeenCalledWith(
        'test.txt'
      );
    });
  });

  describe('getFileStream', () => {
    it('should call localStorageProvider.getFileStream', async () => {
      const mockStream = {} as NodeJS.ReadableStream;
      mockLocalStorageProvider.getFileStream.mockResolvedValue(mockStream);

      const result = await service.getFileStream('test.txt');

      expect(result).toBe(mockStream);
      expect(mockLocalStorageProvider.getFileStream).toHaveBeenCalledWith(
        'test.txt'
      );
    });
  });
});
