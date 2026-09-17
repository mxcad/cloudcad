import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MxFun } from 'mxdraw';
import { CAD_EVENTS } from '@/constants/events';

/**
 * 打开串行化 + 单实例回归（用户反馈：从项目打开部分图纸一直转圈）。
 *
 * 引擎 mxcad-app 的 hideLoading 受 _isStopLoading 单向闩锁保护：openFile 入口
 * 无条件 stopAllLoading()，而 _isStopLoading 只置位永不复位。重叠的第二次
 * openWebFile 会锁死首次打开的 hideLoading/callOpenFileComplete → loading
 * 永久转圈。isReady() 只表示引擎对象已创建（WASM 加载完），不代表文档已加载，
 * 故串行队列必须在发起下一个打开前先等当前文档 openFileComplete。
 * MxCADView 必须严格单实例（重复 new 会重复注册引擎全局监听）。
 *
 * 注意：本文件在 __tests__/ 下，vi.mock 的路径相对本文件解析——
 * 模块兄弟用 '../xxx'，services 级用 '../../xxx'。写成 './xxx' 会解析到
 * 不存在的 __tests__/xxx，静默失效（mock 不生效但无报错）。
 */

const state = vi.hoisted(() => {
  const handlers = new Map<string, Array<() => void>>();
  return {
    opens: [] as Array<{
      url: string;
      resolve: () => void;
      reject: (error?: Error) => void;
    }>,
    viewInstances: 0,
    engineListenerRegistrations: [] as string[],
    handlers,
    subscribe(event: string, handler: () => void): () => void {
      let list = handlers.get(event);
      if (!list) {
        list = [];
        handlers.set(event, list);
      }
      list.push(handler);
      return () => {
        const idx = list!.indexOf(handler);
        if (idx >= 0) list!.splice(idx, 1);
      };
    },
    emit(event: string): void {
      const list = handlers.get(event);
      if (!list) return;
      for (const handler of [...list]) handler();
    },
  };
});

vi.mock('mxcad-app/style', () => ({}));
vi.mock('mxcad-app', () => ({
  MxCADView: class MockMxCADView {
    create: ReturnType<typeof vi.fn> = vi.fn();
    constructor() {
      state.viewInstances += 1;
    }
  },
}));
// vitest 配置将 mxcad/mxdraw 均别名到同一空模块（src/test/__mocks__/empty.ts），
// 两个 vi.mock 工厂会互相覆盖，故在同一个工厂里同时提供两侧导出
vi.mock('mxcad', () => ({
  MxCpp: { getCurrentMxCAD: vi.fn() },
  MxFun: { on: vi.fn(), addCommand: vi.fn(), removeCommand: vi.fn() },
}));
vi.mock('@/api-sdk', () => ({
  thumbnailControllerCheckThumbnail: vi.fn(),
}));
vi.mock('@/utils/authCheck', () => ({ isAuthenticated: vi.fn() }));
vi.mock('@/utils/errorHandler', () => ({ handleError: vi.fn() }));
vi.mock('@/languages', () => ({ t: (msg: string) => msg }));
vi.mock('@/stores/useCADEditorStore', () => ({
  useCADEditorStore: { getState: vi.fn() },
}));
vi.mock('@/config/tokenRefresh', () => ({
  ensureFreshAuthCookie: vi.fn(async () => undefined),
}));
vi.mock('@/services/drawingSession', () => ({
  openSession: vi.fn(),
  emitOpenComplete: vi.fn(),
  emit: vi.fn(),
  subscribe: (event: string, handler: () => void) => state.subscribe(event, handler),
  setModified: vi.fn(),
  getCurrentFileUrl: vi.fn(),
  getCacheTimestamp: vi.fn(),
  setCurrentFileUrl: vi.fn(),
}));
vi.mock('../mxcadHelpers', () => ({
  getFileInfo: vi.fn(),
  setEditorFileName: vi.fn(),
  restoreEditorTitle: vi.fn(),
  refreshFileName: vi.fn(),
}));
vi.mock('../mxcadOpenFlow', () => ({
  MxCADOpenFlow: class MxCADOpenFlowStub {
    openFileCalls: Array<{ url: string }> = [];
    reloadCalls = 0;
    async openFile(payload: { url: string }): Promise<void> {
      this.openFileCalls.push({ url: payload.url });
      return new Promise<void>((resolve, reject) => {
        state.opens.push({
          url: payload.url,
          resolve: () => resolve(),
          reject: (error?: Error) => reject(error ?? new Error('打开失败')),
        });
      });
    }
    async reloadCurrentFile(): Promise<boolean> {
      this.reloadCalls += 1;
      return new Promise<boolean>((resolve) => {
        state.opens.push({
          url: 'reload',
          resolve: () => resolve(true),
          reject: () => resolve(false),
        });
      });
    }
  },
}));
vi.mock('../mxcadContainerManager', () => ({
  MxCADContainerManager: {
    getInstance: () => ({ getContainer: () => document.createElement('div') }),
  },
}));
vi.mock('../mxcadCache', () => ({ clearOldMxwebCache: vi.fn() }));
vi.mock('../mxcadThumbnail', () => ({
  generateThumbnail: vi.fn(),
  uploadThumbnail: vi.fn(),
}));
vi.mock('../applyVipExportIcons', () => ({ applyVipExportIcons: vi.fn() }));
vi.mock('../vipCommandGuard', () => ({ installVipCommandGuard: vi.fn() }));

import {
  MxCADInstanceManager,
  hasDocumentLoaded,
  waitForDocumentLoaded,
} from '../mxcadInstanceManager';
import { getFileInfo } from '../mxcadHelpers';

type InstanceInternals = {
  mxcadView: unknown;
  isInitialized: boolean;
  initPromise: Promise<void> | null;
  openTail: Promise<void>;
  engineListenersInstalled: boolean;
  fileOpenListenerAttached: boolean;
  settledProbeAttached: boolean;
  userOpenDispatched: boolean;
  attachFileOpenListener: (retries?: number) => void;
  settleInitial: (ok: boolean) => void;
  createInstance: () => Promise<void>;
  openFlow: {
    openFileCalls: Array<{ url: string }>;
    reloadCalls: number;
  };
};

function internalsOf(target: object): InstanceInternals {
  return target as unknown as InstanceInternals;
}

/** 让实例报告「引擎已就绪 + 当前文件名为 currentFileName」 */
function stubReady(
  manager: MxCADInstanceManager,
  currentFileName = 'abc.mxweb'
): void {
  internalsOf(manager).mxcadView = {
    mxcad: { getCurrentFileName: () => currentFileName },
  };
  internalsOf(manager).isInitialized = true;
}

/** 刷微任务队列，让串行队列推进到下一个 await 边界 */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.opens.length = 0;
  state.viewInstances = 0;
  state.engineListenerRegistrations.length = 0;
  state.handlers.clear();
  vi.mocked(MxFun.on).mockImplementation((name: string) => {
    state.engineListenerRegistrations.push(name);
  });
});

describe('打开串行队列', () => {
  it('并发两个 openFile：第二个排队，等第一个结束才发起', async () => {
    const manager = new MxCADInstanceManager();
    stubReady(manager);

    const p1 = manager.openFile({ url: 'a.mxweb' });
    const p2 = manager.openFile({ url: 'b.mxweb' });
    await flush();

    const { openFlow } = internalsOf(manager);
    expect(openFlow.openFileCalls).toEqual([{ url: 'a.mxweb' }]);

    state.opens[0].resolve();
    await flush();

    expect(openFlow.openFileCalls).toEqual([
      { url: 'a.mxweb' },
      { url: 'b.mxweb' },
    ]);
    state.opens[1].resolve();
    await Promise.all([p1, p2]);
  });

  it('reloadCurrentFile 与 openFile 共用同一条串行队列', async () => {
    const manager = new MxCADInstanceManager();
    stubReady(manager);

    const open = manager.openFile({ url: 'a.mxweb' });
    await flush();
    const reload = manager.reloadCurrentFile();
    await flush();

    const { openFlow } = internalsOf(manager);
    // reload 必须等 openFile 结束（同队列），不能在打开进行中发起
    expect(openFlow.reloadCalls).toBe(0);

    state.opens[0].resolve();
    await flush();
    expect(openFlow.reloadCalls).toBe(1);

    state.opens[1].resolve();
    await Promise.all([open, reload]);
  });

  it('上一个打开失败不阻塞后续打开', async () => {
    const manager = new MxCADInstanceManager();
    stubReady(manager);

    const p1 = manager.openFile({ url: 'a.mxweb' });
    // 立即挂上处理器，避免 rejection 在断言前变成 unhandled rejection
    // 立即挂上失败处理器，避免 rejection 变成 unhandled rejection
    const rejection = p1.then(
      () => {
        throw new Error('期望 openFile 拒绝');
      },
      (error: unknown) => error
    );
    const p2 = manager.openFile({ url: 'b.mxweb' });
    await flush();

    const { openFlow } = internalsOf(manager);
    expect(openFlow.openFileCalls).toEqual([{ url: 'a.mxweb' }]);

    state.opens[0].reject(new Error('boom'));
    await flush();

    expect(openFlow.openFileCalls).toEqual([
      { url: 'a.mxweb' },
      { url: 'b.mxweb' },
    ]);
    const rejectedWith = await rejection;
    expect(rejectedWith).toBeInstanceOf(Error);
    expect((rejectedWith as Error).message).toBe('boom');
    state.opens[1].resolve();
    await Promise.allSettled([p2]);
  });
});

describe('排队后等待当前文档加载完成', () => {
  it('当前为空模板：排队中的打开等 openFileComplete 才发起', async () => {
    const manager = new MxCADInstanceManager();
    stubReady(manager, 'empty_template.mxweb');

    const open = manager.openFile({ url: 'a.mxweb' });
    await flush();
    expect(internalsOf(manager).openFlow.openFileCalls).toHaveLength(0);

    state.emit(CAD_EVENTS.OPEN_COMPLETE);
    await flush();
    expect(internalsOf(manager).openFlow.openFileCalls).toEqual([
      { url: 'a.mxweb' },
    ]);

    state.opens[0].resolve();
    await open;
  });

  it('当前文档已加载完成：排队后立即发起，不等待 openFileComplete', async () => {
    const manager = new MxCADInstanceManager();
    stubReady(manager, 'abc.mxweb');

    const open = manager.openFile({ url: 'a.mxweb' });
    await flush();
    // 未派发任何 openFileComplete 就已发起 → 证明已加载时跳过等待
    expect(internalsOf(manager).openFlow.openFileCalls).toEqual([
      { url: 'a.mxweb' },
    ]);

    state.opens[0].resolve();
    await open;
  });
});

describe('hasDocumentLoaded — 区分空模板与真实图纸', () => {
  const cases = [
    { name: 'null（引擎无当前文件名）', fileName: null, expected: false },
    { name: '空字符串', fileName: '', expected: false },
    {
      name: '默认空模板 empty_template.mxweb',
      fileName: 'empty_template.mxweb',
      expected: false,
    },
    { name: '默认空模板 empty.mxweb', fileName: 'empty.mxweb', expected: false },
    { name: '真实图纸', fileName: 'abc.mxweb', expected: true },
  ] as const;

  it.each(cases)('$name → $expected', ({ fileName, expected }) => {
    expect(hasDocumentLoaded({ getCurrentFileName: () => fileName })).toBe(
      expected
    );
  });
});

describe('waitForDocumentLoaded — 加载等待与超时兜底', () => {
  it('当前文档已加载完成：立即返回 true，不订阅事件', async () => {
    await expect(
      waitForDocumentLoaded({ getCurrentFileName: () => 'abc.mxweb' })
    ).resolves.toBe(true);
  });

  it('空模板挂起：收到 openFileComplete 后返回 true', async () => {
    const pending = waitForDocumentLoaded({
      getCurrentFileName: () => 'empty_template.mxweb',
    });
    await flush();

    state.emit(CAD_EVENTS.OPEN_COMPLETE);
    await expect(pending).resolves.toBe(true);
  });

  it('等不到 openFileComplete：按超时返回 false，不永久卡住', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* 静默超时告警 */
    });
    try {
      await expect(
        waitForDocumentLoaded({ getCurrentFileName: () => null }, 20)
      ).resolves.toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  })
  it('引擎已在订阅前派发完成（成功）时零等待返回，不依赖事件订阅', async () => {
    // 回归：默认模板由引擎 requestIdleCallback 打开，完全可能在订阅建立前就完成，
    // 那种情况订阅收不到事件会白等满超时拖慢首开。
    const manager = {
      getCurrentFileName: () => 'empty_template.mxweb',
      getOpenSettled: () => ({ count: 1, ok: true }),
    };
    const start = performance.now();
    await expect(waitForDocumentLoaded(manager, 30_000)).resolves.toBe(true);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('引擎已派发失败结果码时零等待返回 false，不等满超时', async () => {
    // 失败（非 0）同样算「初始加载已结束」：不该被当成"还在加载"继续等。
    const manager = {
      getCurrentFileName: () => 'empty_template.mxweb',
      getOpenSettled: () => ({ count: 1, ok: false }),
    };
    const start = performance.now();
    await expect(waitForDocumentLoaded(manager, 5_000)).resolves.toBe(false);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('初始加载结算：成功与失败都算已结束', () => {
  it('getOpenSettled 只记初始加载一次，MxDrawObject 层结果码决定 ok', async () => {
    const manager = new MxCADInstanceManager();
    const handlers = new Map<string, (iResult: number) => Promise<void>>();
    internalsOf(manager).mxcadView = {
      mxcad: {
        on: vi.fn(),
        getCurrentFileName: () => 'empty_template.mxweb',
        getMxDrawObject: () => ({
          addEvent: (
            name: string,
            handler: (iResult: number) => Promise<void>
          ) => handlers.set(name, handler),
        }),
      },
    };
    internalsOf(manager).isInitialized = true;
    // onOpen 成功路径会跑 handleOpenCompleteSideEffects；给 currentFileInfo 让它走
    // setEditorFileName 分支并早退，不必再补 store 状态
    vi.mocked(getFileInfo).mockReturnValue({
      name: 'initial.mxweb',
      fileId: 'initial-1',
    } as never);
    internalsOf(manager).attachFileOpenListener();

    const onOpen = handlers.get('openFileComplete');
    expect(onOpen).toBeDefined();
    expect(manager.getOpenSettled()).toEqual({ count: 0, ok: false });

    await onOpen!(7);
    expect(manager.getOpenSettled()).toEqual({ count: 1, ok: false });

    // 重复结算不重复计数：这是「初始加载是否已结束」的布尔事实，不是打开次数
    await onOpen!(0);
    expect(manager.getOpenSettled()).toEqual({ count: 1, ok: true });
  });

  it('已发起用户打开后不再用初始结算记录跳过等待', async () => {
    // 回归：openFile 派发 __openWebFile__ 即返回，引擎加载仍在进行。
    // 若此时仍能用「初始加载已结算」跳过等待，连续点开会发起重叠打开、锁死引擎。
    const manager = new MxCADInstanceManager();
    internalsOf(manager).mxcadView = {
      mxcad: {
        on: vi.fn(),
        getCurrentFileName: () => 'empty_template.mxweb',
        getMxDrawObject: () => ({ addEvent: () => undefined }),
      },
    };
    internalsOf(manager).isInitialized = true;
    internalsOf(manager).attachFileOpenListener();
    internalsOf(manager).settleInitial(true);
    expect(manager.getOpenSettled()).toEqual({ count: 1, ok: true });

    internalsOf(manager).userOpenDispatched = true;
    internalsOf(manager).settleInitial(true);
    expect(manager.getOpenSettled()).toEqual({ count: 0, ok: false });
  });

  it('MxDrawObject 未就绪时立即挂 McObject 层结算探测，不等 3s 重试窗口', async () => {
    // 回归（用户实测首开固定慢 3s）：MxDrawObject 层监听要重试 30×100ms 才挂上，
    // 默认空模板的 openFileComplete 往往在这 3s 内就派发完——监听器还没挂上就漏掉，
    // waitForDocumentLoaded 只能等满超时。故 McObject 层探测须在首次调用时就挂。
    const manager = new MxCADInstanceManager();
    const mcHandlers = new Map<string, () => void>();
    internalsOf(manager).mxcadView = {
      mxcad: {
        getCurrentFileName: () => 'empty_template.mxweb',
        getMxDrawObject: () => {
          throw new Error(
            "Cannot read properties of undefined (reading 'mxdrawObject')"
          );
        },
        on: (name: string, handler: () => void) =>
          mcHandlers.set(name, handler),
      },
    };
    internalsOf(manager).isInitialized = true;

    internalsOf(manager).attachFileOpenListener();

    // 第一次调用就挂上 McObject 层探测（此时 MxDrawObject 层还没拿到）
    expect(internalsOf(manager).settledProbeAttached).toBe(true);
    const probe = mcHandlers.get('openFileComplete');
    expect(probe).toBeDefined();

    // 探测捕获到 openFileComplete 即计入已结算 → waitForDocumentLoaded 零等待
    probe!();
    expect(manager.getOpenSettled()).toEqual({ count: 1, ok: false });
    const start = performance.now();
    await expect(waitForDocumentLoaded(manager, 30_000)).resolves.toBe(false);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('MxCADView 单实例', () => {
  it('createInstance 重复调用只创建一次 MxCADView', async () => {
    const manager = new MxCADInstanceManager();

    await internalsOf(manager).createInstance();
    await internalsOf(manager).createInstance();

    expect(state.viewInstances).toBe(1);
  });

  it('MxFun 引擎全局监听只注册一次', async () => {
    const manager = new MxCADInstanceManager();

    await internalsOf(manager).createInstance();
    await internalsOf(manager).createInstance();

    expect(state.engineListenerRegistrations).toEqual([
      'mxcadApplicationCreatedMxCADObject',
    ]);
  });

  it('initialize 复用已就绪实例，不重复创建视图', async () => {
    const manager = new MxCADInstanceManager();
    internalsOf(manager).mxcadView = {};
    internalsOf(manager).isInitialized = true;

    await manager.initialize();
    await manager.initialize();

    expect(state.viewInstances).toBe(0);
  });
});
