/**
 * L1 特征测试 —— lib/proc.js killTree（前台整树终止原语）
 *
 * 目的：锁定 Step A-2 引入的 killTree 行为，作为前台真修复（P2.2 可杀进程树）的回归守卫。
 * - Windows 分支：taskkill /PID /T /F（mock spawnSync）
 * - Linux 分支：process.kill(-pgid)（mock os.platform + process.kill，isolateModules 重载）
 */
describe('killTree', () => {
  let spawnSyncMock;
  let killMock;
  let moduleUnderTest;

  const loadWithPlatform = (platform) => {
    jest.resetModules();
    jest.mock('os', () => ({ ...jest.requireActual('os'), platform: () => platform }));
    if (platform === 'win32') {
      killMock = jest.fn();
      spawnSyncMock = jest.fn(() => ({ status: 0 }));
      jest.mock('child_process', () => {
        const actual = jest.requireActual('child_process');
        return { ...actual, spawnSync: spawnSyncMock, spawn: actual.spawn };
      });
      // process.kill 原样（Windows 分支不依赖）
      jest.spyOn(process, 'kill').mockImplementation(killMock);
    } else {
      killMock = jest.fn();
      jest.spyOn(process, 'kill').mockImplementation(killMock);
      spawnSyncMock = jest.fn();
      jest.mock('child_process', () => {
        const actual = jest.requireActual('child_process');
        return { ...actual, spawnSync: spawnSyncMock, spawn: actual.spawn };
      });
    }
    moduleUnderTest = require('../../../runtime/scripts/lib/proc');
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  describe('Windows 分支', () => {
    beforeEach(() => loadWithPlatform('win32'));

    test('调用 taskkill /PID <pid> /T /F', () => {
      moduleUnderTest.killTree(1234);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'taskkill',
        ['/PID', '1234', '/T', '/F'],
        expect.any(Object)
      );
    });

    test('taskkill 失败也返回 true（视为已清理，不抛错）', () => {
      spawnSyncMock.mockReturnValue({ status: 128 });
      expect(moduleUnderTest.killTree(1)).toBe(true);
    });

    test('无 pid 时返回 false', () => {
      expect(moduleUnderTest.killTree(null)).toBe(false);
      expect(moduleUnderTest.killTree(undefined)).toBe(false);
      expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    test('taskkill 抛出异常时返回 false 并警告', () => {
      spawnSyncMock.mockImplementation(() => { throw new Error('boom'); });
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(moduleUnderTest.killTree(42)).toBe(false);
      spy.mockRestore();
    });
  });

  describe('Linux 分支', () => {
    beforeEach(() => loadWithPlatform('linux'));

    test('向进程组发 SIGTERM（-pid）', () => {
      killMock.mockImplementation(() => {});
      moduleUnderTest.killTree(99);
      expect(killMock).toHaveBeenCalledWith(-99, 'SIGTERM');
    });

    test('force=true 时发 SIGKILL', () => {
      killMock.mockImplementation(() => {});
      moduleUnderTest.killTree(77, { force: true });
      expect(killMock).toHaveBeenCalledWith(-77, 'SIGKILL');
    });

    test('ESRCH（进程组已不存在）视为成功，不抛错', () => {
      const err = new Error('no process');
      err.code = 'ESRCH';
      killMock.mockImplementation(() => { throw err; });
      expect(moduleUnderTest.killTree(5)).toBe(true);
    });

    test('非 ESRCH 错误返回 false 并警告', () => {
      const err = new Error('EPERM');
      err.code = 'EPERM';
      killMock.mockImplementation(() => { throw err; });
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect(moduleUnderTest.killTree(5)).toBe(false);
      spy.mockRestore();
    });

    test('无 pid 时返回 false 且不调用 kill', () => {
      expect(moduleUnderTest.killTree(0)).toBe(false);
      expect(killMock).not.toHaveBeenCalled();
    });
  });
});
