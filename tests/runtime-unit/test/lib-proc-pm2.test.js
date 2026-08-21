/**
 * L1 特征测试 —— lib/proc.js PM2 状态查询 + 端口占用检测
 *
 * 目的：锁定 Step A-2 理顺（统一 PM2 托管基础服务）新增的辅助函数行为：
 * - getPm2StatusList / getPm2AppStatus / getPm2OnlineApps：解析 pm2 jlist JSON
 * - getPidByPort：netstat/lsof 解析端口占用 PID
 * - isNodePid：判断 PID 是否为 node 进程
 * 这些是 Q1（复用 + 清理重复实例）与 Q2（端口冲突检测）的判定原语。
 */

const path = require('path');

// 顶层 mock：控制 context 的 PM2 路径（USE_RUNTIME=true 使 PM2_JS 非空）
jest.mock('../../../runtime/scripts/lib/context', () => {
  const actual = jest.requireActual('../../../runtime/scripts/lib/context');
  return {
    ...actual,
    IS_WINDOWS: true,
    IS_LINUX: false,
    USE_RUNTIME: true,
    PROJECT_ROOT: 'd:/mock/root',
    PM2_JS: 'd:/mock/pm2.js',
    PM2_HOME: 'd:/mock/data/pm2',
    PM2_CMD: 'd:/mock/pm2.cmd',
    NODE_EXE: 'd:/mock/node.exe',
    PNPM_JS: 'd:/mock/pnpm.cjs',
  };
});

// 顶层 mock child_process.spawnSync（工厂引用外部 mock 函数，jest 延迟执行工厂）
let spawnSyncMock;
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawnSync: spawnSyncMock,
  };
});

// mock fs.existsSync：让 PM2_JS / PM2_CMD 指向的路径"存在"，否则 getPm2StatusList 直接返回 []
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: (p) => {
      if (p === 'd:/mock/pm2.js' || p === 'd:/mock/pm2.cmd') return true;
      return actual.existsSync(p);
    },
  };
});

describe('lib/proc PM2 状态查询', () => {
  let proc;

  beforeEach(() => {
    jest.resetModules();
    spawnSyncMock = jest.fn();
    proc = require('../../../runtime/scripts/lib/proc');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  describe('getPm2StatusList', () => {
    test('解析 pm2 jlist JSON 返回 app 数组', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([
          { name: 'postgresql', pm2_env: { status: 'online' }, pid: 100 },
          { name: 'backend', pm2_env: { status: 'stopped' }, pid: 0 },
        ]),
      });
      const list = proc.getPm2StatusList();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('postgresql');
    });

    test('jlist 返回非零退出码时返回空数组', () => {
      spawnSyncMock.mockReturnValue({ status: 1, stdout: '' });
      expect(proc.getPm2StatusList()).toEqual([]);
    });

    test('jlist 输出非法 JSON 时返回空数组', () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: 'not-json' });
      expect(proc.getPm2StatusList()).toEqual([]);
    });
  });

  describe('getPm2AppStatus', () => {
    test('返回 online 状态', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([
          { name: 'redis', pm2_env: { status: 'online' }, pid: 1 },
        ]),
      });
      expect(proc.getPm2AppStatus('redis')).toBe('online');
    });

    test('返回 stopped 状态', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([
          { name: 'redis', pm2_env: { status: 'stopped' }, pid: 0 },
        ]),
      });
      expect(proc.getPm2AppStatus('redis')).toBe('stopped');
    });

    test('app 未注册返回 unknown', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([
          { name: 'redis', pm2_env: { status: 'online' }, pid: 1 },
        ]),
      });
      expect(proc.getPm2AppStatus('nonexistent')).toBe('unknown');
    });
  });

  describe('getPm2OnlineApps', () => {
    test('返回所有 online app 名集合', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([
          { name: 'postgresql', pm2_env: { status: 'online' }, pid: 1 },
          { name: 'redis', pm2_env: { status: 'online' }, pid: 2 },
          { name: 'cooperate', pm2_env: { status: 'stopped' }, pid: 0 },
        ]),
      });
      const online = proc.getPm2OnlineApps();
      expect(online.has('postgresql')).toBe(true);
      expect(online.has('redis')).toBe(true);
      expect(online.has('cooperate')).toBe(false);
    });
  });

  describe('getPidByPort (Windows netstat)', () => {
    test('解析 LISTENING 行的 PID', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: [
          '  TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    12345',
          '  TCP    127.0.0.1:6379  0.0.0.0:0    LISTENING    6789',
        ].join('\n'),
      });
      expect(proc.getPidByPort(3001)).toBe(12345);
    });

    test('端口未被占用返回 null', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: '  TCP    0.0.0.0:9999    0.0.0.0:0    LISTENING    12345',
      });
      expect(proc.getPidByPort(3001)).toBeNull();
    });

    test('netstat 异常时返回 null', () => {
      spawnSyncMock.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(proc.getPidByPort(3001)).toBeNull();
    });
  });

  describe('isNodePid (Windows tasklist)', () => {
    test('node.exe 进程返回 true', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: '"node.exe","12345","Console","1","40,000 K"',
      });
      expect(proc.isNodePid(12345)).toBe(true);
    });

    test('非 node 进程返回 false', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: '"postgres.exe","12345","Console","1","80,000 K"',
      });
      expect(proc.isNodePid(12345)).toBe(false);
    });
  });

  describe('getProcessExecutablePath (Windows PowerShell)', () => {
    test('解析 PowerShell Get-CimInstance 输出的可执行路径', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: 'D:\\web\\MxCADOnline\\cloudcad\\runtime\\windows\\redis\\redis-server.exe\r\n',
      });
      expect(proc.getProcessExecutablePath(1234)).toBe(
        'D:\\web\\MxCADOnline\\cloudcad\\runtime\\windows\\redis\\redis-server.exe'
      );
    });

    test('无输出时返回 null', () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '' });
      expect(proc.getProcessExecutablePath(1234)).toBeNull();
    });

    test('异常时返回 null', () => {
      spawnSyncMock.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(proc.getProcessExecutablePath(1234)).toBeNull();
    });
  });

  describe('isOurRuntimeProcess', () => {
    test('可执行文件在本部署包 runtime 目录下 → true', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: 'd:/mock/root/runtime/windows/redis/redis-server.exe\r\n',
      });
      expect(proc.isOurRuntimeProcess(1234)).toBe(true);
    });

    test('外部系统服务（非 runtime 目录）→ false', () => {
      spawnSyncMock.mockReturnValue({
        status: 0,
        stdout: 'C:\\Program Files\\Redis\\redis-server.exe\r\n',
      });
      expect(proc.isOurRuntimeProcess(1234)).toBe(false);
    });

    test('路径不可解析 → false', () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '' });
      expect(proc.isOurRuntimeProcess(1234)).toBe(false);
    });
  });
});
