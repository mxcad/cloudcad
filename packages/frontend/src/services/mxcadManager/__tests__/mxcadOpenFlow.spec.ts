import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vitest 配置将 mxcad/mxdraw 均别名到同一空模块（src/test/__mocks__/empty.ts），
// 两个 vi.mock 工厂会互相覆盖，故在同一个工厂里同时提供两侧导出
const { sendStringToExecuteMock } = vi.hoisted(() => ({
  sendStringToExecuteMock: vi.fn(),
}));

vi.mock('mxcad', () => ({
  FetchAttributes: {
    EMSCRIPTEN_FETCH_LOAD_TO_MEMORY: 1,
    EMSCRIPTEN_FETCH_PERSIST_FILE: 2,
    EMSCRIPTEN_FETCH_REPLACE: 4,
  },
  MxFun: { sendStringToExecute: sendStringToExecuteMock },
  // mxcadHelpers 顶层依赖（restoreEditorTitle 链路）
  MxCpp: { getCurrentMxCAD: vi.fn() },
}));

// mxcad-app 真实库顶层代码依赖完整浏览器 DOM（createCursor → getContext('2d') 等），
// happy-dom 无法加载 → import 阶段崩溃。mxcadOpenFlow 经 mxcadInstanceManager
// 间接 import mxcad-app，故在此 mock（与 mxcadInstanceManager.spec 一致）。
vi.mock('mxcad-app/style', () => ({}));
vi.mock('mxcad-app', () => ({ MxCADView: vi.fn() }));

vi.mock('@/languages', () => ({
  t: (msg: string) => msg,
}));

vi.mock('@/config/clientSetup', () => ({
  ensureFreshAuthCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api-sdk', () => ({
  projectControllerGetPersonalSpace: vi.fn(),
}));

vi.mock('@/services/drawingSession', () => ({
  getCurrentFileUrl: vi.fn(),
  setCurrentFileUrl: vi.fn(),
}));

import { MxCADOpenFlow } from '../mxcadOpenFlow';
import { getCurrentFileUrl, setCurrentFileUrl } from '@/services/drawingSession';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import type { MxCADInstanceManager } from '../mxcadInstanceManager';

/** 模拟 mxcad-app 插件上下文（编辑器标题的唯一出口：fileName.value） */
const fileNameValue = { value: '' };

/** 引擎事件/retCall 仿真：按真实派发顺序记录，测试中手动触发 */
function createEngineSim() {
  const openCompleteHandlers: Array<(iResult: number) => void> = [];
  let lastRetCall: ((code: number) => void) | null = null;
  const mxdraw = {
    addEvent: vi.fn((name: string, handler: (iResult: number) => void) => {
      if (name === 'openFileComplete') openCompleteHandlers.push(handler);
    }),
    removeEventFuction: vi.fn(),
  };
  sendStringToExecuteMock.mockImplementation(
    (_cmd: string, args: unknown[]) => {
      lastRetCall = args[1] as (code: number) => void;
    }
  );
  return {
    mxdraw,
    /** 模拟引擎派发 openFileComplete（携带结果码） */
    fireOpenComplete(iResult: number) {
      openCompleteHandlers.forEach((h) => h(iResult));
    },
    /** 模拟同一派发中稍后触发的 retCall */
    fireRetCall(code: number) {
      lastRetCall?.(code);
    },
    get retCallRegistered() {
      return lastRetCall !== null;
    },
  };
}

describe('MxCADOpenFlow — openFileComplete 结果码门控（打开失败不得记录当前文件状态）', () => {
  let engine: ReturnType<typeof createEngineSim>;
  let pendingInfo: { fileInfo: { fileId: string } } | null;
  let flow: MxCADOpenFlow;
  /** 引擎 getCurrentFileName 返回值（早退捷径测试用，可配置） */
  let engineCurrentFileName: string | null = null;

  const previousUrl = '/api/v1/mxcad/filesData/202608/prev-id/prev.mxweb?t=1';

  beforeEach(() => {
    vi.clearAllMocks();
    pendingInfo = null;
    engineCurrentFileName = null;
    fileNameValue.value = '';
    vi.stubGlobal('MxPluginContext', {
      useFileName: () => ({ fileName: fileNameValue }),
    });
    engine = createEngineSim();
    const managerStub = {
      isReady: () => true,
      isCreated: () => true,
      getCurrentView: () => ({ mxcad: { getMxDrawObject: () => engine.mxdraw } }),
      getMxcadObject: () => ({}),
      getCurrentFileName: () => engineCurrentFileName,
      getInitPromise: () => null,
      getPendingOpenInfo: () => pendingInfo,
      setPendingOpenInfo: (info: typeof pendingInfo) => {
        pendingInfo = info;
      },
    };
    flow = new MxCADOpenFlow(
      managerStub as unknown as MxCADInstanceManager
    );
    (getCurrentFileUrl as Mock).mockReturnValue(previousUrl);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useCADEditorStore.getState().setCurrentFileInfo(null);
  });

  /**
   * openFile/reloadCurrentFile 是 async 函数，首个 await（ensureFreshAuthCookie）之前的
   * 同步代码先执行，监听器注册发生在续体微任务中；触发引擎事件前必须先冲刷微任务。
   */
  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('成功（结果码 0）：resolve，且不触发失败收尾（pending 保留待消费/URL 不回滚）', async () => {
    const targetUrl = '/api/v1/mxcad/filesData/202608/new-id/new.mxweb?t=2';
    const p = flow.openFile({
      url: targetUrl,
      fileInfo: { fileId: 'new-id' },
    });
    await flushMicrotasks();
    // 引擎成功完成打开：openFileComplete 带 0，随后 retCall 也带 0
    engine.fireOpenComplete(0);
    engine.fireRetCall(0);

    await expect(p).resolves.toBeUndefined();
    // 成功路径不清理 pending（由 setupFileOpenListener 消费 openSession），不回滚 URL
    expect(pendingInfo).toEqual({ fileInfo: { fileId: 'new-id' } });
    expect(setCurrentFileUrl).toHaveBeenCalledTimes(1);
    expect(setCurrentFileUrl).toHaveBeenCalledWith(targetUrl);
  });

  it('失败（openFileComplete 结果码非 0 + retCall 非 0）：reject「文件打开失败」，清理 pending 并回滚 URL', async () => {
    const targetUrl = '/api/v1/mxcad/filesData/202608/fail-id/fail.mxweb?t=3';
    const p = flow.openFile({
      url: targetUrl,
      fileInfo: { fileId: 'fail-id' },
    });
    await flushMicrotasks();

    // 关键回归场景：引擎对失败打开也派发 openFileComplete（McObject 层丢失结果码），
    // 旧实现在此无条件 resolve + setupFileOpenListener 消费 pending → 错误记录会话/title。
    // 新实现必须等到结果码 0 才 resolve，非 0 由稍后的 retCall 走 fail。
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);

    await expect(p).rejects.toThrow('文件打开失败');
    // 失败收尾：清理待生效会话 + 回滚引擎侧 URL（还原上一个图纸状态）
    expect(pendingInfo).toBeNull();
    expect(setCurrentFileUrl).toHaveBeenCalledWith(previousUrl);
  });

  it('失败但 openFileComplete 先派发非 0、retCall 未触发（超时兜底）：reject「文件打开超时」', async () => {
    vi.useFakeTimers();
    const p = flow.openFile({ url: '/api/v1/mxcad/filesData/202608/timeout-id/t.mxweb?t=4' });
    await flushMicrotasks();
    // 引擎只派发了失败结果码，retCall 一直未触发（403 类失败）→ 60s 超时兜底。
    // 先挂上 rejection 断言再推进计时器，避免 rejection 在微任务检查点被判为 unhandled
    const assertion = expect(p).rejects.toThrow('文件打开超时');
    engine.fireOpenComplete(403);

    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
    expect(pendingInfo).toBeNull();
  });

  it('打开失败时既不 resolve 也不提前 reject（等待 retCall 结果）', async () => {
    const p = flow.openFile({ url: '/api/v1/mxcad/filesData/202608/f-id/f.mxweb?t=5' });
    await flushMicrotasks();
    let settled = false;
    p.then(
      () => (settled = true),
      () => (settled = true)
    );
    // openFileComplete 非 0 已派发，但 retCall 尚未触发：promise 必须保持 pending
    engine.fireOpenComplete(1);
    await flushMicrotasks();
    expect(settled).toBe(false);
    expect(engine.retCallRegistered).toBe(true);

    engine.fireRetCall(1);
    await expect(p).rejects.toThrow('文件打开失败');
  });

  it('失败且无当前文件（首次进入）：标题修正为目标图纸名而非 mxweb 内部文件名', async () => {
    useCADEditorStore.getState().setCurrentFileInfo(null);
    const targetUrl = '/api/v1/mxcad/filesData/202608/fail-id/abc.mxweb?t=3';
    const p = flow.openFile({
      url: targetUrl,
      fileInfo: {
        fileId: 'fail-id',
        parentId: null,
        projectId: null,
        name: '我的图纸.dwg',
        personalSpaceId: null,
      },
    });
    await flushMicrotasks();
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);

    await expect(p).rejects.toThrow('文件打开失败');
    // 回归：mxcad-app 会把标题显示成 URL 尾部内部文件名（abc.mxweb?t=3），
    // 修复后应显示图纸名「我的图纸.dwg」
    expect(fileNameValue.value).toContain('我的图纸.dwg');
    expect(fileNameValue.value).not.toContain('abc.mxweb');
  });

  it('失败但已有当前文件（切换打开失败）：标题恢复为当前文件，不显示失败图纸名', async () => {
    useCADEditorStore.getState().setCurrentFileInfo({
      fileId: 'prev-id',
      parentId: null,
      projectId: 'project-prev',
      name: '已打开图纸.dwg',
      personalSpaceId: null,
    });
    const p = flow.openFile({
      url: '/api/v1/mxcad/filesData/202608/fail-id/fail.mxweb?t=6',
      fileInfo: {
        fileId: 'fail-id',
        parentId: null,
        projectId: null,
        name: '失败图纸.dwg',
        personalSpaceId: null,
      },
    });
    await flushMicrotasks();
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);

    await expect(p).rejects.toThrow('文件打开失败');
    // 切换失败：标题保持当前文件（已打开图纸.dwg），不得被失败图纸覆盖
    expect(fileNameValue.value).toContain('已打开图纸.dwg');
    expect(fileNameValue.value).not.toContain('失败图纸.dwg');
  });

  it('失败后重试同一图纸：引擎文件名匹配但不早退（会话未记录），走真正打开流程', async () => {
    // 失败后引擎 currentFileName 被置为 URL 尾部内部文件名，与目标 URL 尾部一致
    engineCurrentFileName = 'retry.mxweb?t=7';
    useCADEditorStore.getState().setCurrentFileInfo(null);
    const targetUrl = '/api/v1/mxcad/filesData/202608/retry-id/retry.mxweb?t=7';
    const p = flow.openFile({
      url: targetUrl,
      fileInfo: {
        fileId: 'retry-id',
        parentId: null,
        projectId: null,
        name: '重试图纸.dwg',
        personalSpaceId: null,
      },
    });
    await flushMicrotasks();
    // 回归：旧早退捷径只按文件名匹配 → 失败后重试直接 resolve 跳过真正打开，
    // 调用方随后 emitFileOpened 记录失败状态。修复后必须发出打开命令（retCall 注册）
    expect(engine.retCallRegistered).toBe(true);
    // 本次打开仍失败 → 正常失败收尾 + 标题修正为图纸名
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);
    await expect(p).rejects.toThrow('文件打开失败');
    expect(pendingInfo).toBeNull();
    expect(fileNameValue.value).toContain('重试图纸.dwg');
    expect(fileNameValue.value).not.toContain('retry.mxweb');
  });

  it('同一文件已成功打开（引擎文件名与会话 fileId 均匹配）：早退跳过重复打开并清理 pending', async () => {
    engineCurrentFileName = 'same.mxweb?t=8';
    useCADEditorStore.getState().setCurrentFileInfo({
      fileId: 'same-id',
      parentId: null,
      projectId: 'project-same',
      name: '已开图纸.dwg',
      personalSpaceId: null,
    });
    const p = flow.openFile({
      url: '/api/v1/mxcad/filesData/202608/same-id/same.mxweb?t=8',
      fileInfo: {
        fileId: 'same-id',
        parentId: null,
        projectId: 'project-same',
        name: '已开图纸.dwg',
        personalSpaceId: null,
      },
    });
    await flushMicrotasks();

    await expect(p).resolves.toBeUndefined();
    // 早退：未发出打开命令，且刚设置的 pending 已清理（避免残留被后续事件消费）
    expect(engine.retCallRegistered).toBe(false);
    expect(pendingInfo).toBeNull();
  });
});

describe('MxCADOpenFlow — reloadCurrentFile 结果码门控', () => {
  let engine: ReturnType<typeof createEngineSim>;
  let flow: MxCADOpenFlow;

  beforeEach(() => {
    vi.clearAllMocks();
    fileNameValue.value = '';
    vi.stubGlobal('MxPluginContext', {
      useFileName: () => ({ fileName: fileNameValue }),
    });
    engine = createEngineSim();
    const managerStub = {
      isReady: () => true,
      isCreated: () => true,
      getCurrentView: () => ({ mxcad: { getMxDrawObject: () => engine.mxdraw } }),
      getMxcadObject: () => ({}),
      getCurrentFileName: () => null,
      getInitPromise: () => null,
      getPendingOpenInfo: () => null,
      setPendingOpenInfo: () => undefined,
    };
    flow = new MxCADOpenFlow(
      managerStub as unknown as MxCADInstanceManager
    );
    (getCurrentFileUrl as Mock).mockReturnValue('/api/v1/mxcad/filesData/202608/a/b.mxweb?t=9');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useCADEditorStore.getState().setCurrentFileInfo(null);
  });

  it('成功（结果码 0）：resolve(true)', async () => {
    const p = flow.reloadCurrentFile();
    await Promise.resolve();
    await Promise.resolve();
    engine.fireOpenComplete(0);

    await expect(p).resolves.toBe(true);
  });

  it('失败（结果码非 0 + retCall 非 0）：resolve(false)', async () => {
    const p = flow.reloadCurrentFile();
    await Promise.resolve();
    await Promise.resolve();
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);

    await expect(p).resolves.toBe(false);
  });

  it('失败时恢复当前文件标题（reload 针对已打开文件，引擎会把标题改成 mxweb 内部文件名）', async () => {
    useCADEditorStore.getState().setCurrentFileInfo({
      fileId: 'current-id',
      parentId: null,
      projectId: 'project-current',
      name: '当前图纸.dwg',
      personalSpaceId: null,
    });
    const p = flow.reloadCurrentFile();
    await Promise.resolve();
    await Promise.resolve();
    engine.fireOpenComplete(1);
    engine.fireRetCall(1);

    await expect(p).resolves.toBe(false);
    expect(fileNameValue.value).toContain('当前图纸.dwg');
    expect(fileNameValue.value).not.toContain('b.mxweb');
  });

  it('无任何完成信号（403 类）：超时兜底 resolve(false)', async () => {
    vi.useFakeTimers();
    const p = flow.reloadCurrentFile();
    await Promise.resolve();
    await Promise.resolve();

    const assertion = expect(p).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
  });
});
