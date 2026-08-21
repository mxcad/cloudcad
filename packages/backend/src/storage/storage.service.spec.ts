import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { StorageService } from './storage.service';
import { IStorageProvider } from './interfaces/storage-provider.interface';

describe('StorageService', () => {
  let service: StorageService;

  const mockStorageProvider = {
    exists: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    delete: jest.fn(),
    getMetaData: jest.fn(),
    copyFromFs: jest.fn(),
    copy: jest.fn(),
    move: jest.fn(),
    deleteAll: jest.fn(),
    getUrl: jest.fn(),
    listAll: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'filesDataPath') return '/fake/files';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: IStorageProvider, useValue: mockStorageProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('file operations', () => {
    it('writeFile delegates to provider write', async () => {
      await service.writeFile('k', 'data');
      expect(mockStorageProvider.write).toHaveBeenCalledWith('k', 'data');
    });

    it('writeStream delegates to provider write', async () => {
      const stream = Readable.from(['stream-data']);
      await service.writeStream('k', stream);
      expect(mockStorageProvider.write).toHaveBeenCalledWith('k', stream);
    });

    it('deleteFile delegates to provider delete', async () => {
      await service.deleteFile('k');
      expect(mockStorageProvider.delete).toHaveBeenCalledWith('k');
    });

    it('fileExists delegates to provider exists', async () => {
      mockStorageProvider.exists.mockResolvedValue(true);
      expect(await service.fileExists('k')).toBe(true);
    });

    it('getFileStream delegates to provider read', async () => {
      mockStorageProvider.read.mockResolvedValue(Readable.from(['x']));
      await service.getFileStream('k');
      expect(mockStorageProvider.read).toHaveBeenCalledWith('k');
    });

    it('getFile reads provider stream as string', async () => {
      mockStorageProvider.read.mockResolvedValue(Readable.from(['hello']));
      expect(await service.getFile('k')).toBe('hello');
    });

    it('getFileBytes reads provider stream as bytes', async () => {
      mockStorageProvider.read.mockResolvedValue(
        Readable.from([Buffer.from([1, 2, 3])])
      );
      expect(Array.from(await service.getFileBytes('k'))).toEqual([1, 2, 3]);
    });

    it('getFileInfo delegates to provider getMetaData', async () => {
      mockStorageProvider.getMetaData.mockResolvedValue({
        contentLength: 3,
        contentType: 'text/plain',
        lastModified: new Date(),
        etag: 'x',
      });
      expect(await service.getFileInfo('k')).toEqual({
        contentType: 'text/plain',
        contentLength: 3,
      });
    });

    it('getFileInfo returns null when provider throws', async () => {
      mockStorageProvider.getMetaData.mockRejectedValue(new Error('missing'));
      expect(await service.getFileInfo('k')).toBeNull();
    });

    it('copyFromFs delegates to provider copyFromFs', async () => {
      await service.copyFromFs('/src', 'dst');
      expect(mockStorageProvider.copyFromFs).toHaveBeenCalledWith('/src', 'dst');
    });

    it('deleteAll delegates to provider deleteAll', async () => {
      await service.deleteAll('prefix');
      expect(mockStorageProvider.deleteAll).toHaveBeenCalledWith('prefix');
    });

    it('copyFile delegates to provider copy', async () => {
      await service.copyFile('src', 'dst');
      expect(mockStorageProvider.copy).toHaveBeenCalledWith('src', 'dst');
    });

    it('moveFile delegates to provider move', async () => {
      await service.moveFile('src', 'dst');
      expect(mockStorageProvider.move).toHaveBeenCalledWith('src', 'dst');
    });

    it('getUrl delegates to provider getUrl', async () => {
      mockStorageProvider.getUrl.mockResolvedValue('https://x');
      expect(await service.getUrl('k')).toBe('https://x');
    });

    it('listFiles maps provider listAll results', async () => {
      mockStorageProvider.listAll.mockResolvedValue({
        objects: [
          { name: 'a', isFile: true },
          { name: 'b', isFile: false },
        ],
      });
      expect(await service.listFiles('prefix')).toEqual(['a']);
    });

    it('listFiles filters by startsWith', async () => {
      mockStorageProvider.listAll.mockResolvedValue({
        objects: [
          { name: 'aaa', isFile: true },
          { name: 'bbb', isFile: true },
        ],
      });
      expect(await service.listFiles('prefix', 'a')).toEqual(['aaa']);
    });
  });
});
