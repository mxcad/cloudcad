jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: jest.fn().mockReturnValue(true) };
});

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import { ExtRefPreloadingService } from './ext-ref-preloading.service';

describe('ExtRefPreloadingService', () => {
  let service: ExtRefPreloadingService;
  let mockConfigService: any;
  let mockNodeService: any;
  let mockStorageManager: any;
  let fsPromisesMock: any;
  let fsMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    fsPromisesMock = jest.requireMock('fs/promises');
    fsMock = jest.requireMock('fs');
    mockConfigService = { get: jest.fn().mockReturnValue('') };
    mockNodeService = { findById: jest.fn() };
    mockStorageManager = { getFullPath: jest.fn() };
    service = new ExtRefPreloadingService(
      mockConfigService,
      mockNodeService,
      mockStorageManager
    );
  });

  describe('getPreloadingFileName', () => {
    it('should generate filename from nodeId and path', () => {
      expect(service.getPreloadingFileName('node-1', 'node-1.dwg.mxweb')).toBe('node-1.dwg.mxweb_preloading.json');
    });

    it('should fallback to dwg when nodePath is empty', () => {
      expect(service.getPreloadingFileName('node-1', '')).toBe('node-1.dwg.mxweb_preloading.json');
    });

    it('should handle path without nodeId prefix', () => {
      expect(service.getPreloadingFileName('node-1', 'custom.pdf.mxweb')).toBe('node-1.pdf.mxweb_preloading.json');
    });

    it('should handle path without mxweb extension', () => {
      expect(service.getPreloadingFileName('node-1', 'node-1.dwg')).toBe('node-1.dwg.mxweb_preloading.json');
    });
  });

  describe('readPreloadingData', () => {
    it('should parse preloading JSON and return data', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ src_file_md5: 'abc123', tz: false, images: [], externalReference: [] }));

      const result = await service.readPreloadingData('node-1');
      expect(result).toEqual({ srcFileMd5: 'abc123', tz: false, images: [], externalReference: [] });
    });

    it('should return null when preloading file does not exist', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      const err = new Error('ENOENT');
      (err as any).code = 'ENOENT';
      fsPromisesMock.readFile.mockRejectedValue(err);

      expect(await service.readPreloadingData('node-1')).toBeNull();
    });
  });

  describe('checkExists', () => {
    it('should return true when file exists', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsMock.existsSync.mockReturnValue(true);

      expect(await service.checkExists('node-1')).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsMock.existsSync.mockReturnValue(false);

      expect(await service.checkExists('node-1')).toBe(false);
    });

    it('should fall back to mxcadUploadPath and check existence when node has no path', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: null });
      fsMock.existsSync.mockReturnValue(false);
      expect(await service.checkExists('node-1')).toBe(false);
    });
  });

  describe('writePreloading', () => {
    it('should write preloading JSON file with merged data', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ src_file_md5: 'abc123', tz: false, images: ['old.png'], externalReference: [] }));

      const result = await service.writePreloading('node-1', { images: ['new.png'] });

      expect(result).toBe(true);
      expect(fsPromisesMock.writeFile).toHaveBeenCalled();
      const writeCall = fsPromisesMock.writeFile.mock.calls[0][1];
      const written = JSON.parse(writeCall);
      expect(written.src_file_md5).toBe('abc123');
      expect(written.images).toContain('new.png');
    });

    it('should write new file when no existing preloading data', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      const err = new Error('ENOENT');
      (err as any).code = 'ENOENT';
      fsPromisesMock.readFile.mockRejectedValue(err);

      const result = await service.writePreloading('node-1', { srcFileMd5: 'new-md5', tz: true, externalReference: ['ref.dwg'] });

      expect(result).toBe(true);
      const writeCall = fsPromisesMock.writeFile.mock.calls[0][1];
      const written = JSON.parse(writeCall);
      expect(written.src_file_md5).toBe('new-md5');
      expect(written.externalReference).toEqual(['ref.dwg']);
    });
  });

  describe('getExtRefDirName', () => {
    it('should return nodeId when preloading file has no src_file_md5', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ tz: false, images: [], externalReference: [] }));

      expect(await service.getExtRefDirName('node-1')).toBe('node-1');
    });

    it('should return src_file_md5 from preloading JSON', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'node-1', path: 'node-1.dwg.mxweb' });
      mockStorageManager.getFullPath.mockReturnValue('/data/node-1.dwg.mxweb');
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ src_file_md5: 'abc123', tz: false, images: [], externalReference: [] }));

      expect(await service.getExtRefDirName('node-1')).toBe('abc123');
    });
  });
});
