import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * openHistoricalVersion 的打开前置守卫回归。
 *
 * 历史版本 = 同一节点的另一份内容，移动端无标签页概念，打开即替换当前文档。
 * 此前本路径既不过守卫也不清状态：未保存更改被静默丢弃（PC 走 window.open
 * 新标签页，天然不受此约束，所以这个缺陷只在移动端存在）。
 *
 * 锁定的不变量：
 *  - 守卫返回 false（用户取消「是否保存」/「退出协同」）必须中止打开；
 *  - 中止时不跑预热、不改 ?v=、不碰 openDrawing（取消不该付出数十秒转换代价）；
 *  - 放行时按 buildCurrentFileRequest 重建请求并原样交给 openDrawing。
 *
 * 注：happy-dom 的 history.replaceState 对 URL 变更是静默 no-op（location 不变），
 * 故「原地改 ?v=」通过 spy 断言实参，而非读 location。
 */

const {
  guardMock,
  warmupMock,
  openDrawingMock,
  showToastMock,
  editorStateMock,
} = vi.hoisted(() => ({
  guardMock: vi.fn(),
  warmupMock: vi.fn(),
  openDrawingMock: vi.fn(),
  showToastMock: vi.fn(),
  editorStateMock: {
    state: { fileId: 'n1', fileInfo: { path: 'p/a.mxweb' }, libraryKey: null },
  },
}));

vi.mock('../api-sdk', () => ({ versionControlControllerGetFileHistory: vi.fn() }));
vi.mock('../languages', () => ({ t: (s: string) => s }));
vi.mock('vant', () => ({ showToast: showToastMock }));
vi.mock('@/stores/editor', () => ({ useEditorStore: () => editorStateMock }));
vi.mock('@/composables/useOpenGuard', () => ({
  useOpenGuard: () => ({ guardBeforeOpen: guardMock }),
}));
vi.mock('../services/versionWarmup', () => ({
  warmupHistoricalVersion: warmupMock,
}));
vi.mock('../services/drawingOpener', () => ({
  openDrawing: openDrawingMock,
}));
vi.mock('../utils/apiError', () => ({
  unwrap: <T,>(res: { data?: T }) => res.data ?? ({} as T),
  errMsg: (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : fallback,
}));
vi.mock('../utils/editorOpenParams', () => ({
  parseEditorOpenParams: () => ({ shareToken: null }),
}));

import { useVersionHistory } from './useVersionHistory';

/** replaceState 收到的 URL（happy-dom 不回写到 location，只能看调用参数） */
let replacedUrls: string[] = [];

function setup() {
  return useVersionHistory();
}

beforeEach(() => {
  vi.clearAllMocks();
  replacedUrls = [];
  vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _title, url) => {
    replacedUrls.push(String(url));
  });
  guardMock.mockResolvedValue(true);
  warmupMock.mockResolvedValue(undefined);
  openDrawingMock.mockResolvedValue(true);
  editorStateMock.state = {
    fileId: 'n1',
    fileInfo: { path: 'p/a.mxweb' },
    libraryKey: null,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openHistoricalVersion', () => {
  it('守卫返回 false（取消未保存更改）：中止打开，不跑预热、不改 ?v=、不打开', async () => {
    guardMock.mockResolvedValue(false);

    await expect(setup().openHistoricalVersion(3)).resolves.toBe(false);

    expect(warmupMock).not.toHaveBeenCalled();
    expect(openDrawingMock).not.toHaveBeenCalled();
    expect(replacedUrls).toHaveLength(0);
  });

  it('守卫通过：原地改写 ?v= 后用重建的请求打开（无 libraryKey → node 源）', async () => {
    const ok = await setup().openHistoricalVersion(3);

    expect(ok).toBe(true);
    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(warmupMock).toHaveBeenCalledWith('p/a.mxweb', 3);
    expect(new URL(replacedUrls[replacedUrls.length - 1]).searchParams.get('v')).toBe('3');
    expect(openDrawingMock).toHaveBeenCalledWith({ source: 'node', nodeId: 'n1' });
  });

  it('预热失败：中止且不打开', async () => {
    warmupMock.mockRejectedValue(new Error('boom'));

    await expect(setup().openHistoricalVersion(3)).resolves.toBe(false);

    expect(openDrawingMock).not.toHaveBeenCalled();
  });
});
