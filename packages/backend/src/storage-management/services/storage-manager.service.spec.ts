import { StorageManager } from './storage-manager.service';

/**
 * node.path 解码约定单点（C8）：StorageManager 是 DB 存储路径
 * （YYYYMM[/N]/nodeId/...，可带 /mxcad/file/ 前缀）→ 节点目录的唯一解码出口。
 * 表驱动覆盖解码、IDOR 安全比较与无效路径的 no-op 语义。
 */
describe('StorageManager 路径解码', () => {
  let localStorageProvider: {
    deleteDirectory: jest.Mock;
    directoryExists: jest.Mock;
  };
  let manager: StorageManager;

  beforeEach(() => {
    localStorageProvider = {
      deleteDirectory: jest.fn(async () => {}),
      directoryExists: jest.fn(async () => false),
    };
    manager = new StorageManager(
      {} as never,
      localStorageProvider as never
    );
  });

  describe('parseNodeDirectory（表驱动）', () => {
    it.each([
      ['202607/node-1', '202607/node-1'],
      ['202607/node-1/file.dwg', '202607/node-1'],
      ['/mxcad/file/202607/node-1/file.dwg', '202607/node-1'],
      ['/mxcad/file/202607/node-1', '202607/node-1'],
      ['202607/3/node-1/file.dwg', '202607/3'],
      ['badpath', null],
      ['202607', null],
      ['', null],
      ['/', null],
    ])('parseNodeDirectory(%j) => %j', (input, expected) => {
      expect(manager.parseNodeDirectory(input)).toBe(expected);
    });
  });

  describe('getNodeDirectoryRelativePath（保留旧调用方的回落语义）', () => {
    it.each([
      ['202607/node-1/file.dwg', '202607/node-1'],
      ['/mxcad/file/202607/node-1/file.dwg', '202607/node-1'],
      ['badpath', 'badpath'],
      ['/mxcad/file/badpath', 'badpath'],
    ])('getNodeDirectoryRelativePath(%j) => %j', (input, expected) => {
      expect(manager.getNodeDirectoryRelativePath(input)).toBe(expected);
    });
  });

  describe('isSameNodeStoragePath（分享 IDOR 安全比较）', () => {
    const main = '202509/node-1/main.dwg';
    it.each([
      // 同节点目录下的关联文件（外部参照）：放行
      ['202509/node-1/ref.dwg', true],
      // 主文件本身（调用方先做精确相等判断，此处带尾部 / 的比较同样为真）
      ['202509/node-1/main.dwg', true],
      // 同月前缀兄弟目录（YYYYMM/<nodeId>-evil/…）：必须拒绝（裸 startsWith 回归）
      ['202509/node-1-evil/steal.dwg', false],
      // 同月其他节点：拒绝
      ['202509/other/file.dwg', false],
      // 跨月：拒绝
      ['202510/node-1/file.dwg', false],
      // 目录本身（非目录内文件）：拒绝
      ['202509/node-1', false],
    ])('isSameNodeStoragePath(%j, main) => %j', (requested, expected) => {
      expect(manager.isSameNodeStoragePath(requested, main)).toBe(expected);
    });

    it('主文件路径段数不足 2 时恒为 false', () => {
      expect(manager.isSameNodeStoragePath('anything', 'badpath')).toBe(false);
      expect(
        manager.isSameNodeStoragePath('202509/node-1/main.dwg', 'badpath')
      ).toBe(false);
    });
  });

  describe('deleteNodeStorage（吃 DB 路径，内部解码）', () => {
    it('有效路径：按解码后的节点目录删除', async () => {
      await manager.deleteNodeStorage('202607/node-1/file.dwg');
      expect(localStorageProvider.deleteDirectory).toHaveBeenCalledWith(
        '202607/node-1'
      );
    });

    it('带 /mxcad/file/ 前缀：解码后删除', async () => {
      await manager.deleteNodeStorage('/mxcad/file/202607/node-1/file.dwg');
      expect(localStorageProvider.deleteDirectory).toHaveBeenCalledWith(
        '202607/node-1'
      );
    });

    it('无效路径：告警 no-op，不触碰存储', async () => {
      await manager.deleteNodeStorage('badpath');
      expect(localStorageProvider.deleteDirectory).not.toHaveBeenCalled();
    });
  });

  describe('nodeStorageExists（吃 DB 路径，内部解码）', () => {
    it('有效路径：按解码后的节点目录查询', async () => {
      localStorageProvider.directoryExists.mockResolvedValue(true);
      await expect(
        manager.nodeStorageExists('202607/node-1/file.dwg')
      ).resolves.toBe(true);
      expect(localStorageProvider.directoryExists).toHaveBeenCalledWith(
        '202607/node-1'
      );
    });

    it('无效路径：返回 false，不触碰存储', async () => {
      await expect(manager.nodeStorageExists('badpath')).resolves.toBe(false);
      expect(localStorageProvider.directoryExists).not.toHaveBeenCalled();
    });
  });
});
