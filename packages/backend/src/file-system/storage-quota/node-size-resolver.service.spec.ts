jest.mock('fs/promises', () => ({
  stat: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { NodeSizeResolverService } from './node-size-resolver.service';

describe('NodeSizeResolverService', () => {
  let service: NodeSizeResolverService;
  let storageManager: Record<string, jest.Mock>;
  let fsPromisesMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    fsPromisesMock = jest.requireMock('fs/promises');

    storageManager = {
      getFullPath: jest
        .fn()
        .mockReturnValue('/data/202607/node-1/drawing.dwg.mxweb'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeSizeResolverService,
        { provide: StorageManager, useValue: storageManager },
      ],
    }).compile();

    service = module.get(NodeSizeResolverService);
  });

  describe('resolveFileSize', () => {
    it('when size 正常：直接用 DB size，不触发物理文件读取', async () => {
      await expect(
        service.resolveFileSize({ size: 1024, path: 'p' }, 'node-1')
      ).resolves.toBe(1024);
      expect(fsPromisesMock.stat).not.toHaveBeenCalled();
    });

    it('when size 为 null 且物理文件可读：按物理文件大小兜底', async () => {
      fsPromisesMock.stat.mockResolvedValue({ size: 2048 });

      await expect(
        service.resolveFileSize({ size: null, path: '202607/node-1/drawing.dwg.mxweb' }, 'node-1')
      ).resolves.toBe(2048);
      expect(fsPromisesMock.stat).toHaveBeenCalledWith(
        '/data/202607/node-1/drawing.dwg.mxweb'
      );
    });

    it('when size 为 null 且 path 缺失：抛 BadRequestException 且不触物理读取', async () => {
      await expect(
        service.resolveFileSize({ size: null, path: null }, 'node-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fsPromisesMock.stat).not.toHaveBeenCalled();
    });

    it('when size 为 null 且物理文件读取失败：抛 BadRequestException', async () => {
      fsPromisesMock.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.resolveFileSize({ size: null, path: '202607/node-1/drawing.dwg.mxweb' }, 'node-1')
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resolveFileSizes', () => {
    it('when 空数组：返回 0', async () => {
      await expect(service.resolveFileSizes([])).resolves.toBe(0);
      expect(fsPromisesMock.stat).not.toHaveBeenCalled();
    });

    it('when 混合 size：DB size 与物理兜底并行求和', async () => {
      fsPromisesMock.stat.mockResolvedValue({ size: 4096 });

      await expect(
        service.resolveFileSizes([
          { id: 'a', size: 100, path: 'pa' },
          { id: 'b', size: null, path: 'pb' },
          { id: 'c', size: 200, path: 'pc' },
        ])
      ).resolves.toBe(4396);
      expect(fsPromisesMock.stat).toHaveBeenCalledTimes(1);
    });

    it('when 任一节点不可读：整批 reject', async () => {
      fsPromisesMock.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.resolveFileSizes([
          { id: 'a', size: 100, path: 'pa' },
          { id: 'b', size: null, path: 'pb' },
        ])
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
