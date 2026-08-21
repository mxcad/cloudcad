/**
 * L1 特征测试 —— foreground/registry.js cleanupForeground（前台整树退出，P2.2）
 *
 * 目的：锁定 Ctrl+C 后前台进程整树退出的行为：
 * 1. 对所有存活子进程先发 SIGTERM（优雅关停）
 * 2. 延时后对仍存活进程用 killTree 整树强杀
 * 3. 清理 state.childProcesses
 *
 * mock：killTree（lib/proc）、setTimeout（避免真实延时）
 * 注意：registry 与 lib/state 必须在同一模块缓存实例下加载（共享 childProcesses），
 * 因此统一通过 resetModules + 一次 require 获取。
 */
jest.mock('../../../runtime/scripts/lib/proc', () => ({
  killTree: jest.fn(),
}));

let state;
let registry;
let killTreeMock;

const realSetTimeout = global.setTimeout;
let pendingTimeouts = [];
function fakeSetTimeout(fn, ms) {
  pendingTimeouts.push({ fn, ms });
  return { fn, ms };
}

beforeEach(() => {
  pendingTimeouts = [];
  global.setTimeout = fakeSetTimeout;
  jest.resetModules();
  // 同一缓存实例下加载 state 与 registry，确保 childProcesses 共享
  state = require('../../../runtime/scripts/lib/state');
  registry = require('../../../runtime/scripts/foreground/registry');
  killTreeMock = require('../../../runtime/scripts/lib/proc').killTree;
});

afterEach(() => {
  global.setTimeout = realSetTimeout;
  state.childProcesses.clear();
  jest.clearAllMocks();
});

describe('cleanupForeground', () => {
  test('对所有存活子进程发 SIGTERM', () => {
    const p1 = { killed: false, kill: jest.fn(), pid: 1 };
    const p2 = { killed: false, kill: jest.fn(), pid: 2 };
    state.childProcesses.add(p1);
    state.childProcesses.add(p2);

    registry.cleanupForeground();

    expect(p1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(p2.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('已 killed 的进程不重复发信号', () => {
    const live = { killed: false, kill: jest.fn(), pid: 1 };
    const dead = { killed: true, kill: jest.fn(), pid: 2 };
    state.childProcesses.add(live);
    state.childProcesses.add(dead);

    registry.cleanupForeground();

    expect(live.kill).toHaveBeenCalledWith('SIGTERM');
    expect(dead.kill).not.toHaveBeenCalled();
  });

  test('延时后对仍存活进程调用 killTree 整树强杀', () => {
    const p1 = { killed: false, kill: jest.fn(), pid: 1234 };
    state.childProcesses.add(p1);

    registry.cleanupForeground();

    expect(pendingTimeouts.length).toBe(1);
    pendingTimeouts[0].fn(); // 执行延时的回调

    expect(killTreeMock).toHaveBeenCalledWith(
      1234,
      expect.objectContaining({ silent: true })
    );
    expect(state.childProcesses.size).toBe(0);
  });

  test('进程 kill 抛异常时不中断清理', () => {
    const p1 = { killed: false, kill: jest.fn(() => { throw new Error('boom'); }), pid: 1 };
    const p2 = { killed: false, kill: jest.fn(), pid: 2 };
    state.childProcesses.add(p1);
    state.childProcesses.add(p2);

    expect(() => registry.cleanupForeground()).not.toThrow();
    expect(p2.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('空进程表时无副作用', () => {
    expect(() => registry.cleanupForeground()).not.toThrow();
    expect(pendingTimeouts.length).toBe(1);
  });
});
