import { Test, TestingModule } from '@nestjs/testing';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const mockFindThumbnail = jest.fn();
const mockSpawnManagedProcess = jest.fn();

jest.mock('@cloudcad/engine-exec', () => ({
  spawnManagedProcess: (...args: any[]) => mockSpawnManagedProcess(...args),
}));

jest.mock('./thumbnail-utils', () => {
  const actual = jest.requireActual('./thumbnail-utils');
  return {
    ...actual,
    findThumbnail: (...args: any[]) => mockFindThumbnail(...args),
  };
});

describe('ThumbnailGenerationService', () => {
  let service: ThumbnailGenerationService;
  let moduleRef: TestingModule;

  const mockConfigService = { get: jest.fn() };
  const mockFileSystemNodeService = { findById: jest.fn() };
  const mockStorageManager = { getFullPath: jest.fn() };

  async function buildService() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThumbnailGenerationService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
      ],
    }).compile();
    const svc = module.get<ThumbnailGenerationService>(
      ThumbnailGenerationService
    );
    await new Promise((r) => setTimeout(r, 100));
    return svc;
  }

  beforeEach(async () => {
    mockFindThumbnail.mockReset();
    mockFindThumbnail.mockResolvedValue(null);
    mockSpawnManagedProcess.mockReset();
    mockSpawnManagedProcess.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    });
    mockConfigService.get.mockReset();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'thumbnail') {
        return {
          autoGenerateEnabled: true,
          width: 200,
          height: 200,
          dwg2JpgPath: process.execPath,
        };
      }
      if (key === 'mxcadTempPath') return 'data/temp';
      return undefined;
    });
    mockFileSystemNodeService.findById.mockReset();
    mockStorageManager.getFullPath.mockReset();
    mockStorageManager.getFullPath.mockImplementation((relativePath: string) =>
      path.join(os.tmpdir(), 'thumbnail-test', relativePath)
    );

    service = await buildService();
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('should return true when enabled on Windows with exe available', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('generateThumbnail（受管子进程）', () => {
    const mockSpawnResult = (over: Record<string, unknown>) =>
      mockSpawnManagedProcess.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
        ...over,
      } as never);

    async function buildRealCadFile(): Promise<string> {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-cad-'));
      const cadPath = path.join(dir, 'plan.dwg');
      fs.writeFileSync(cadPath, 'fake-dwg');
      return cadPath;
    }

    function useTmpTempPath() {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'thumbnail') {
          return {
            autoGenerateEnabled: true,
            width: 200,
            height: 200,
            dwg2JpgPath: process.execPath,
          };
        }
        if (key === 'mxcadTempPath') return os.tmpdir();
        return undefined;
      });
    }

    it('spawn 参数带引号包裹 fileparam（verbatim 下防路径含空格被切碎）', async () => {
      useTmpTempPath();
      service = await buildService();
      await service.onModuleInit();
      const cadPath = await buildRealCadFile();
      mockSpawnResult({});
      await service.generateThumbnail(cadPath, os.tmpdir(), 'node-1');

      expect(mockSpawnManagedProcess).toHaveBeenCalledTimes(1);
      const [, args, opts] = mockSpawnManagedProcess.mock.calls[0];
      expect(args[0]).toBe('cadtojpg');
      expect(args[1]).toMatch(/^"fileparam=.+"$/);
      expect(opts).toEqual(
        expect.objectContaining({ timeoutMs: 60000, cwd: expect.any(String) })
      );
    });

    it('超时被杀时返回失败且不误报成功', async () => {
      useTmpTempPath();
      service = await buildService();
      await service.onModuleInit();
      const cadPath = await buildRealCadFile();
      mockSpawnResult({ timedOut: true, signal: 'SIGTERM', exitCode: null });

      const result = await service.generateThumbnail(cadPath, os.tmpdir());

      expect(result.success).toBe(false);
      expect(result.error).toContain('超时');
    });

    it('非零退出码视为失败（与原 exec 行为一致）', async () => {
      useTmpTempPath();
      service = await buildService();
      await service.onModuleInit();
      const cadPath = await buildRealCadFile();
      mockSpawnResult({ exitCode: 1, stderr: 'boom' });

      const result = await service.generateThumbnail(cadPath, os.tmpdir());

      expect(result.success).toBe(false);
      expect(result.error).toContain('1');
    });

    it('进程未能启动（spawn 失败）返回失败', async () => {
      useTmpTempPath();
      service = await buildService();
      await service.onModuleInit();
      const cadPath = await buildRealCadFile();
      mockSpawnResult({ exitCode: null, signal: null, stderr: 'ENOENT' });

      const result = await service.generateThumbnail(cadPath, os.tmpdir());

      expect(result.success).toBe(false);
      expect(result.error).toContain('未能启动');
    });
  });

  describe('checkThumbnailExists', () => {
    it('should return exists=true when thumbnail file found', async () => {
      mockFileSystemNodeService.findById.mockResolvedValue({
        id: 'node-1',
        path: 'project/file.dwg',
        fileHash: 'abc123',
      });
      mockFindThumbnail.mockResolvedValue({
        path: '/fake/thumbnail.jpg',
        fileName: 'thumbnail.jpg',
        format: 'jpg',
        mimeType: 'image/jpeg',
      });

      const result = await service.checkThumbnailExists('node-1');

      expect(result.exists).toBe(true);
      expect(result.location).toBe('local');
      expect(result.fileName).toBe('thumbnail.jpg');
    });

    it('should return exists=false when node not found', async () => {
      mockFileSystemNodeService.findById.mockResolvedValue(null);

      const result = await service.checkThumbnailExists('missing');

      expect(result.exists).toBe(false);
      expect(result.location).toBe('none');
    });
  });

  describe('uploadThumbnail', () => {
    it('should return success when jpg file uploaded', async () => {
      const nodeDir = path.join(os.tmpdir(), 'thumbnail-test', 'project');
      if (!fs.existsSync(nodeDir)) {
        fs.mkdirSync(nodeDir, { recursive: true });
      }
      const testFile = path.join(nodeDir, 'test.jpg');
      fs.writeFileSync(testFile, 'fake-jpg');

      mockFileSystemNodeService.findById.mockResolvedValue({
        id: 'node-1',
        path: 'project/file.dwg',
      });

      const result = await service.uploadThumbnail('node-1', testFile);

      expect(result.success).toBe(true);
    });

    it('should reject non-jpg files', async () => {
      const nodeDir = path.join(os.tmpdir(), 'thumbnail-test', 'project');
      if (!fs.existsSync(nodeDir)) {
        fs.mkdirSync(nodeDir, { recursive: true });
      }
      const testFile = path.join(nodeDir, 'test.png');
      fs.writeFileSync(testFile, 'fake-png');

      mockFileSystemNodeService.findById.mockResolvedValue({
        id: 'node-1',
        path: 'project/file.dwg',
      });

      const result = await service.uploadThumbnail('node-1', testFile);

      expect(result.success).toBe(false);
    });

    it('should return error when node not found', async () => {
      mockFileSystemNodeService.findById.mockResolvedValue(null);

      const result = await service.uploadThumbnail('missing', '/tmp/test.jpg');

      expect(result.success).toBe(false);
    });
  });
});
