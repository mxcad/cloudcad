import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { Readable } from 'stream';

// Mock the entire minio module
jest.mock('minio', () => {
  const mockClient = {
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
    putObject: jest.fn(),
    getObject: jest.fn(),
    removeObject: jest.fn(),
    removeObjects: jest.fn(),
    copyObject: jest.fn(),
    statObject: jest.fn(),
    listObjects: jest.fn(),
    presignedGetObject: jest.fn(),
    presignedPutObject: jest.fn(),
    listBuckets: jest.fn(),
  };

  return {
    Client: jest.fn().mockImplementation(() => mockClient),
    BucketItem: class MockBucketItem {
      name: string;
      size: number;
      etag: string;
      lastModified: Date;
    },
  };
});

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;
  let mockMinioClient: any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'minio.endPoint': 'localhost',
        'minio.port': 9000,
        'minio.useSSL': false,
        'minio.accessKey': 'minioadmin',
        'minio.secretKey': 'minioadmin',
        'minio.bucket': 'cloucad',
        'minio.region': 'us-east-1',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Reset the mock
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get<ConfigService>(ConfigService);
    
    // Get the mock client instance
    const Minio = require('minio');
    mockMinioClient = Minio.Client();
    
    // Initialize the service
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize MinIO client and create bucket if not exists', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('cloucad');
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('cloucad', 'us-east-1');
      expect(consoleSpy).toHaveBeenCalledWith('MinIO bucket cloucad 创建成功');

      consoleSpy.mockRestore();
    });

    it('should not create bucket if it already exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      await service.onModuleInit();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith('cloucad');
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should upload file with buffer', async () => {
      const key = 'test/file.txt';
      const buffer = Buffer.from('test content');
      const expectedResult = { etag: 'test-etag' };

      mockMinioClient.putObject.mockResolvedValue(expectedResult);

      const result = await service.uploadFile(key, buffer);

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'cloucad',
        key,
        buffer,
        undefined,
        {
          'Content-Type': 'application/octet-stream',
        }
      );

      expect(result).toEqual({
        url: 'http://localhost:9000/cloucad/test/file.txt',
        etag: 'test-etag',
        bucket: 'cloucad',
        key,
      });
    });

    it('should upload file with custom options', async () => {
      const key = 'test/file.txt';
      const buffer = Buffer.from('test content');
      const options = {
        contentType: 'text/plain',
        metadata: { custom: 'value' },
      };
      const expectedResult = { etag: 'test-etag' };

      mockMinioClient.putObject.mockResolvedValue(expectedResult);

      const result = await service.uploadFile(key, buffer, options);

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'cloucad',
        key,
        buffer,
        undefined,
        {
          'Content-Type': 'text/plain',
          custom: 'value',
        }
      );

      expect(result).toEqual({
        url: 'http://localhost:9000/cloucad/test/file.txt',
        etag: 'test-etag',
        bucket: 'cloucad',
        key,
      });
    });
  });

  describe('uploadFileFromBuffer', () => {
    it('should upload file from buffer', async () => {
      const key = 'test/file.txt';
      const buffer = Buffer.from('test content');
      const expectedResult = { etag: 'test-etag' };

      mockMinioClient.putObject.mockResolvedValue(expectedResult);

      const result = await service.uploadFileFromBuffer(key, buffer);

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'cloucad',
        key,
        buffer,
        undefined,
        {
          'Content-Type': 'application/octet-stream',
        }
      );

      expect(result).toEqual({
        url: 'http://localhost:9000/cloucad/test/file.txt',
        etag: 'test-etag',
        bucket: 'cloucad',
        key,
      });
    });
  });

  describe('uploadFileFromStream', () => {
    it('should upload file from stream', async () => {
      const key = 'test/file.txt';
      const stream = Readable.from('test content');
      const size = 12;
      const expectedResult = { etag: 'test-etag' };

      mockMinioClient.putObject.mockResolvedValue(expectedResult);

      const result = await service.uploadFileFromStream(key, stream, size);

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'cloucad',
        key,
        stream,
        size,
        {
          'Content-Type': 'application/octet-stream',
        }
      );

      expect(result).toEqual({
        url: 'http://localhost:9000/cloucad/test/file.txt',
        etag: 'test-etag',
        bucket: 'cloucad',
        key,
      });
    });
  });

  describe('getFile', () => {
    it('should get file as buffer', async () => {
      const key = 'test/file.txt';
      const stream = Readable.from('test content');
      const expectedBuffer = Buffer.from('test content');

      mockMinioClient.getObject.mockResolvedValue(stream);

      const result = await service.getFile(key);

      expect(mockMinioClient.getObject).toHaveBeenCalledWith('cloucad', key);
      expect(result).toEqual(expectedBuffer);
    });
  });

  describe('getFileStream', () => {
    it('should get file as stream', async () => {
      const key = 'test/file.txt';
      const stream = Readable.from('test content');

      mockMinioClient.getObject.mockResolvedValue(stream);

      const result = await service.getFileStream(key);

      expect(mockMinioClient.getObject).toHaveBeenCalledWith('cloucad', key);
      expect(result).toBe(stream);
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      const key = 'test/file.txt';

      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await service.deleteFile(key);

      expect(mockMinioClient.removeObject).toHaveBeenCalledWith('cloucad', key);
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files', async () => {
      const keys = ['test/file1.txt', 'test/file2.txt'];

      mockMinioClient.removeObjects.mockResolvedValue(undefined);

      await service.deleteFiles(keys);

      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith('cloucad', keys);
    });
  });

  describe('copyFile', () => {
    it('should copy file', async () => {
      const sourceKey = 'test/source.txt';
      const destKey = 'test/dest.txt';

      mockMinioClient.copyObject.mockResolvedValue(undefined);

      await service.copyFile(sourceKey, destKey);

      expect(mockMinioClient.copyObject).toHaveBeenCalledWith(
        'cloucad',
        destKey,
        'cloucad/test/source.txt'
      );
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      const key = 'test/file.txt';
      mockMinioClient.statObject.mockResolvedValue({});

      const result = await service.fileExists(key);

      expect(mockMinioClient.statObject).toHaveBeenCalledWith('cloucad', key);
      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      const key = 'test/file.txt';
      mockMinioClient.statObject.mockRejectedValue(new Error('Not found'));

      const result = await service.fileExists(key);

      expect(mockMinioClient.statObject).toHaveBeenCalledWith('cloucad', key);
      expect(result).toBe(false);
    });
  });

  describe('getFileStats', () => {
    it('should get file stats', async () => {
      const key = 'test/file.txt';
      const expectedStats = {
        size: 1024,
        lastModified: new Date(),
        etag: 'test-etag',
      };

      mockMinioClient.statObject.mockResolvedValue(expectedStats);

      const result = await service.getFileStats(key);

      expect(mockMinioClient.statObject).toHaveBeenCalledWith('cloucad', key);
      expect(result).toEqual(expectedStats);
    });
  });

  describe('listFiles', () => {
    it('should list files', async () => {
      const prefix = 'test/';
      const expectedItems = [
        {
          name: 'test/file1.txt',
          size: 1024,
          etag: 'etag1',
          lastModified: new Date(),
        },
        {
          name: 'test/file2.txt',
          size: 2048,
          etag: 'etag2',
          lastModified: new Date(),
        },
      ];

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            expectedItems.forEach(item => callback(item));
          } else if (event === 'end') {
            callback();
          }
        }),
      };

      mockMinioClient.listObjects.mockReturnValue(mockStream);

      const result = await service.listFiles(prefix);

      expect(mockMinioClient.listObjects).toHaveBeenCalledWith('cloucad', prefix, true);
      expect(result).toEqual(expectedItems);
    });
  });

  describe('getPresignedUrl', () => {
    it('should get presigned URL', async () => {
      const key = 'test/file.txt';
      const expectedUrl = 'presigned-url';
      const expiry = 3600;

      mockMinioClient.presignedGetObject.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl(key, expiry);

      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith('cloucad', key, expiry);
      expect(result).toBe(expectedUrl);
    });
  });

  describe('getPresignedPutUrl', () => {
    it('should get presigned PUT URL', async () => {
      const key = 'test/file.txt';
      const expectedUrl = 'presigned-put-url';
      const expiry = 3600;

      mockMinioClient.presignedPutObject.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedPutUrl(key, expiry);

      expect(mockMinioClient.presignedPutObject).toHaveBeenCalledWith('cloucad', key, expiry);
      expect(result).toBe(expectedUrl);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockMinioClient.listBuckets.mockResolvedValue([]);

      const result = await service.healthCheck();

      expect(mockMinioClient.listBuckets).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'healthy',
        message: 'MinIO连接正常',
      });
    });

    it('should return unhealthy status on error', async () => {
      const error = new Error('Connection failed');
      mockMinioClient.listBuckets.mockRejectedValue(error);

      const result = await service.healthCheck();

      expect(result).toEqual({
        status: 'unhealthy',
        message: 'MinIO连接失败',
        error: 'Connection failed',
      });
    });
  });
});