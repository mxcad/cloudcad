import { describe, it, expect, vi, beforeEach } from 'vitest';
// 与 mxcadOpenFile.ts 同源导入（相对路径），确保测试与被测代码引用同一 store 实例
import { useConversionQueueStore } from '../../stores/conversionQueueStore';
import {
  handlePublicUpload,
  waitForFileReady,
  openUploadedFile,
  handleOpenFileCommand,
} from './mxcadOpenFile';
import { emit } from '../drawingSession';
import { calculateFileHash } from '../../utils/hashUtils';
import { uploadMxCadFile } from '../../utils/mxcadUploadUtils';
import {
  mxcadUploadControllerCheckFileExist,
  conversionTaskControllerListTasks,
  nodeControllerGetNode,
  nodeControllerGetRootNode,
} from '@/api-sdk';
import {
  showGlobalLoading,
  hideGlobalLoading,
} from '../loadingService';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from './mxcadCollaboration';

// mxcadManager 是全局单例（模块加载即 MxCADManager.getInstance() 拉起 CAD 引擎，测试环境崩溃），
// 必须 mock 整个模块。用 vi.hoisted 共享同一个 openFile mock，确保 mxcadOpenFile.ts 与测试引用同一实例。
const { mockOpenFile } = vi.hoisted(() => ({ mockOpenFile: vi.fn() }));

// mxcadOpenFile.ts 依赖全部 mock（除 conversionQueueStore 与 mxcadManager——
// 前者本测试正是要验证真实 store 接线；后者是全局单例，用 spy 拦截 openFile）。
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('@/utils/quotaUpgradeGuide', () => ({
  isQuotaExceededError: vi.fn(() => false),
}));
vi.mock('@/api-sdk', () => ({
  mxcadUploadControllerCheckFileExist: vi.fn(),
  nodeControllerGetNode: vi.fn(),
  nodeControllerGetRootNode: vi.fn(),
  projectControllerGetPersonalSpace: vi.fn(),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
  // refreshCloud 拉取云端任务（S6-1/S6-6 主上传竞态测试需计数）
  conversionTaskControllerListTasks: vi.fn().mockResolvedValue({
    error: undefined,
    data: { tasks: [], total: 0 },
  }),
}));
vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
  getErrorMessage: vi.fn(() => 'err'),
}));
vi.mock('../../utils/hashUtils', () => ({ calculateFileHash: vi.fn() }));
vi.mock('../../utils/mxcadUploadUtils', () => ({ uploadMxCadFile: vi.fn() }));
vi.mock('@/utils/mxcadUtils', () => ({
  UrlHelper: {
    buildUrl: vi.fn(() => ''),
    buildMxCadFileUrl: vi.fn((path: string) => `/mock/${path}`),
  },
}));
vi.mock('@/constants/storage.constants', () => ({ StoragePathConstants: {} }));
vi.mock('@/utils/notificationEvents', () => ({ globalShowToast: vi.fn() }));
vi.mock('../loadingService', () => ({
  showGlobalLoading: vi.fn(),
  hideGlobalLoading: vi.fn(),
  setLoadingMessage: vi.fn(),
  setLoadingProgress: vi.fn(),
}));
vi.mock('../../stores/useCADEditorStore', () => ({
  useCADEditorStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ currentFileInfo: null }),
  }),
}));
vi.mock('../../stores/fileSystemStore', () => ({
  useFileSystemStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({ personalSpaceId: 'ps-1' }),
  }),
}));
vi.mock('../drawingSession', () => ({
  emitFileOpened: vi.fn(),
  setCacheTimestamp: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('./mxcadManager', () => ({ mxcadManager: { openFile: mockOpenFile } }));
vi.mock('./mxcadTypes', () => ({
  DEFAULT_MESSAGES: {},
  FILE_UPLOAD_CONFIG: {
    chunkSize: 1,
    FILE_PICKER_ID: 'mx-cad-file-picker',
    ALLOWED_EXTENSIONS: '',
  },
}));
vi.mock('./mxcadCollaboration', () => ({
  confirmExitCollaborationIfNeeded: vi.fn(() => Promise.resolve(true)),
  checkAndConfirmUnsavedChanges: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../utils/fileUtils', () => ({
  CAD_EXTENSIONS: ['.dwg', '.dxf'],
}));
vi.mock('@/constants/events', () => ({
  CAD_EVENTS: { PUBLIC_FILE_UPLOADED: 'public_file_uploaded' },
}));

const mockCalculateFileHash = vi.mocked(calculateFileHash);
const mockCheckFileExist = vi.mocked(mxcadUploadControllerCheckFileExist);
const mockUploadMxCadFile = vi.mocked(uploadMxCadFile);
const mockEmit = vi.mocked(emit);
const mockNodeControllerGetNode = vi.mocked(nodeControllerGetNode);
const mockListTasks = vi.mocked(conversionTaskControllerListTasks);
const mockNodeControllerGetRootNode = vi.mocked(nodeControllerGetRootNode);
const mockShowGlobalLoading = vi.mocked(showGlobalLoading);
const mockHideGlobalLoading = vi.mocked(hideGlobalLoading);
const mockConfirmExitCollab = vi.mocked(confirmExitCollaborationIfNeeded);
const mockCheckUnsaved = vi.mocked(checkAndConfirmUnsavedChanges);

function makeFile(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, {
    type: 'application/octet-stream',
  });
}

/** 取 emit(PUBLIC_FILE_UPLOADED) 捕获的 callback（异步打开入口） */
function capturedCallback(): () => Promise<void> {
  const payload = mockEmit.mock.calls[0]?.[1] as {
    callback: () => Promise<void>;
  };
  return payload.callback;
}

/**
 * 可控 EventSource mock：waitPublicFileConverted 建连后由测试推送终态帧。
 * happy-dom 无 EventSource，须注入全局。
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  /** 测试辅助：模拟服务端推一帧 data（终态 COMPLETED/FAILED 或 PROCESSING） */
  send(status: string, hash = 'x'): void {
    this.onmessage?.({ data: JSON.stringify({ hash, status }) });
  }
}

describe('S6-1/S6-6 游客/公开路径登记本地转换任务（handlePublicUpload）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // 登录用户（有 token）：waitForFileReady 的 refreshCloud token 门控放行
    localStorage.setItem('accessToken', 'test-token');
    // 可控 EventSource（上传路径的按文件 SSE 等待）
    MockEventSource.instances = [];
    (globalThis as Record<string, unknown>).EventSource = MockEventSource;
    useConversionQueueStore.setState({ tasks: [] });
  });

  it('缓存命中：登记本地任务(processing)，callback 成功后置 completed', async () => {
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: true } });
    mockOpenFile.mockResolvedValue(undefined);

    await handlePublicUpload(makeFile('drawing.dwg'));

    const localTask = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local');
    expect(localTask).toBeDefined();
    expect(localTask!.status).toBe('processing');
    expect(localTask!.name).toBe('drawing.dwg');

    const cb = capturedCallback();
    await cb();

    const after = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === localTask!.id)!;
    expect(after.status).toBe('completed');
  });

  it('缓存命中：callback 打开失败时置 failed（含 error）', async () => {
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: true } });
    mockOpenFile.mockRejectedValue(new Error('open failed'));

    await handlePublicUpload(makeFile('drawing.dwg'));

    const localTask = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local')!;
    const cb = capturedCallback();
    await cb();

    const after = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === localTask.id)!;
    expect(after.status).toBe('failed');
    expect(after.error).toBe('open failed');
  });

  it('缓存未命中：上传后立即返回，等按文件 SSE COMPLETED 才 emit 打开，callback 成功后置 completed', async () => {
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: false } });
    mockUploadMxCadFile.mockResolvedValue(undefined);
    mockOpenFile.mockResolvedValue(undefined);

    // 启动（不 resolve 到 SSE 终态）
    const uploadPromise = handlePublicUpload(makeFile('drawing.dwg'));

    // 上传完成后建按文件 SSE 连接（URL = 公开 file-stream 端点 + hash）
    await vi.waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });
    expect(MockEventSource.instances[0].url).toContain(
      '/v1/mxcad/conversion/file-stream?hash=hash123'
    );
    // SSE 终态前不 emit（不打开）
    expect(mockEmit).not.toHaveBeenCalled();

    // 服务端通知转换完成 → emit 打开入口
    MockEventSource.instances[0].send('COMPLETED', 'hash123');
    await uploadPromise;
    expect(mockEmit).toHaveBeenCalledTimes(1);

    const localTask = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local')!;
    expect(mockUploadMxCadFile).toHaveBeenCalled();

    const cb = capturedCallback();
    await cb();

    const after = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === localTask.id)!;
    expect(after.status).toBe('completed');
    // SSE 连接在终态后关闭
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('SSE 通知 FAILED：本地任务置 failed（含 error），不 emit 打开', async () => {
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: false } });
    mockUploadMxCadFile.mockResolvedValue(undefined);

    const uploadPromise = handlePublicUpload(makeFile('drawing.dwg'));
    await vi.waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    MockEventSource.instances[0].send('FAILED', 'hash123');
    await uploadPromise;

    // 失败不打开（不 emit）
    expect(mockEmit).not.toHaveBeenCalled();
    const localTask = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local')!;
    expect(localTask.status).toBe('failed');
    expect(localTask.error).toBe('该文件转换失败，请检查文件内容');
  });

  it('latest-wins：A 先转好但已被 B 取代 → A 只置 completed 不打开，B 转好才打开', async () => {
    mockCheckFileExist.mockResolvedValue({ data: { exists: false } });
    mockUploadMxCadFile.mockResolvedValue(undefined);
    mockOpenFile.mockResolvedValue(undefined);

    // 打开 A
    mockCalculateFileHash.mockResolvedValue('hashA');
    const promiseA = handlePublicUpload(makeFile('a.dwg'));
    await vi.waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const esA = MockEventSource.instances[0];

    // 打开 B（取代 A）
    mockCalculateFileHash.mockResolvedValue('hashB');
    const promiseB = handlePublicUpload(makeFile('b.dwg'));
    await vi.waitFor(() => expect(MockEventSource.instances).toHaveLength(2));
    const esB = MockEventSource.instances[1];

    // A 先完成（已被取代）→ 不打开，只置 completed
    esA.send('COMPLETED', 'hashA');
    await promiseA;
    expect(mockEmit).not.toHaveBeenCalled();
    const taskA = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.name === 'a.dwg')!;
    expect(taskA.status).toBe('completed');

    // B 完成（当前打开）→ emit 打开 B
    esB.send('COMPLETED', 'hashB');
    await promiseB;
    expect(mockEmit).toHaveBeenCalledTimes(1);
    // emit 的是 B（hashB）
    const emitted = mockEmit.mock.calls[0]?.[1] as { fileHash: string };
    expect(emitted.fileHash).toBe('hashB');

    const cb = capturedCallback();
    await cb();
    const taskB = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.name === 'b.dwg')!;
    expect(taskB.status).toBe('completed');
  });

  it('外层异常（hash 计算失败）：本地任务置 failed（含 error）', async () => {
    mockCalculateFileHash.mockRejectedValue(new Error('hash failed'));

    await handlePublicUpload(makeFile('drawing.dwg'));

    const localTask = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.source === 'local')!;
    expect(localTask.status).toBe('failed');
    expect(localTask.error).toBe('hash failed');
  });
});

describe('S6-1/S6-6 主上传路径：waitForFileReady 轮询期间重拉云端（消除新上传任务竞态）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 登录用户（有 token）：refreshCloud 的 token 门控放行（否则 no-op，轮询计数为 0）
    localStorage.setItem('accessToken', 'test-token');
    // refreshCloud 拉取云端任务（默认空列表）
    mockListTasks.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0 },
    });
  });

  it('文件未就绪期间每轮等待后重拉云端（refreshCloud 被多次调用，非仅入口一次）', async () => {
    // 前 2 次未就绪（无 fileHash），第 3 次就绪（fileHash + path）→ 触发 2 次轮询迭代
    mockNodeControllerGetNode
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({
        data: {
          fileHash: 'hash123',
          path: '/files/a.dwg',
          name: 'a.dwg',
          parentId: 'parent-1',
        },
      });

    const result = await waitForFileReady('node-1', 5, 1);

    expect(result).toMatchObject({ fileHash: 'hash123' });
    // 首轮触达 1 次 + 未就绪轮询 2 次 = 3 次；关键断言：> 1（证明轮询期间重拉，
    // 否则新上传的云端任务（node.taskId 稍后才写入）会被漏掉）
    expect(mockListTasks.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('节点 FAILED：立即抛失败（不再空等满 maxAttempts 报「文件转换未完成」）', async () => {
    // 打开/导出链路失败保留 FAILED 节点（真实文件不删）：若继续轮询会空等满
    // maxAttempts（默认 60×2s=120s）才报「文件转换未完成」，用户误以为还在转换。
    mockNodeControllerGetNode.mockResolvedValue({
      data: { fileStatus: 'FAILED' },
    });

    await expect(waitForFileReady('node-1', 60, 2000)).rejects.toThrow(
      '该文件转换失败，请检查文件内容'
    );
    // 立即失败：只查一次节点，未进入轮询等待
    expect(mockNodeControllerGetNode).toHaveBeenCalledTimes(1);
  });

  it('节点被删（404 NOT_FOUND，上传链路失败即删）：抛转换失败文案而非裸 404', async () => {
    // 上传链路转换/落盘失败后节点被删除（不留 node 记录）：轮询查到 404 NOT_FOUND
    // 即失败信号，给出与 FAILED 一致的失败文案，而非「节点不存在」。
    mockNodeControllerGetNode.mockResolvedValue({
      error: { code: 'NOT_FOUND', message: '节点不存在' },
    });

    await expect(waitForFileReady('node-1', 60, 2000)).rejects.toThrow(
      '该文件转换失败，请检查文件内容'
    );
    // 立即失败：只查一次节点，未进入轮询等待
    expect(mockNodeControllerGetNode).toHaveBeenCalledTimes(1);
  });

  it('节点查询其他错误（非 404）：透传真实原因，不误判为转换失败', async () => {
    mockNodeControllerGetNode.mockResolvedValue({
      error: { code: 'INTERNAL_SERVER_ERROR', message: '服务器繁忙' },
    });

    await expect(waitForFileReady('node-1', 60, 2000)).rejects.toThrow(
      '服务器繁忙'
    );
    expect(mockNodeControllerGetNode).toHaveBeenCalledTimes(1);
  });

  it('节点 PROCESSING：继续轮询（仅 FAILED 短路，不误杀在途转换）', async () => {
    mockNodeControllerGetNode
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } })
      .mockResolvedValueOnce({
        data: {
          fileStatus: 'COMPLETED',
          fileHash: 'h',
          path: '/p',
          name: 'a.dwg',
          parentId: 'p',
        },
      });

    const result = await waitForFileReady('node-1', 5, 1);
    expect(result).toMatchObject({ fileHash: 'h' });
    expect(mockNodeControllerGetNode).toHaveBeenCalledTimes(2);
  });
});

describe('打开图纸不拉起转换面板：只有确有在途转换才触达', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 登录用户（有 token）：refreshCloud 的 token 门控放行，便于断言「是否真拉过云端」
    localStorage.setItem('accessToken', 'test-token');
    mockListTasks.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0 },
    });
    // 面板默认收起：expandByTask 只对收起态生效，故以收起态作为判据
    useConversionQueueStore.setState({
      tasks: [],
      collapsed: true,
      autoDismissable: false,
    });
  });

  it('文件已就绪（打开已转换完成的图纸）：不触达转换面板、不拉云端', async () => {
    // 侧边栏「打开图纸」→ openUploadedFile → waitForFileReady：已转换文件首轮即返回，
    // 不应拉起面板——面板只由真实的上传 / 导出下载 / 转换动作拉起
    mockNodeControllerGetNode.mockResolvedValue({
      data: { fileHash: 'h', path: '/p', name: 'a.dwg', parentId: 'p' },
    });

    await waitForFileReady('node-1', 5, 1);

    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(false);
    expect(mockListTasks).not.toHaveBeenCalled();
  });

  it('文件未就绪（确有在途转换）：展开面板并标记为可自动收起', async () => {
    mockNodeControllerGetNode
      .mockResolvedValueOnce({ data: { fileStatus: 'PROCESSING' } })
      .mockResolvedValue({
        data: { fileHash: 'h', path: '/p', name: 'a.dwg', parentId: 'p' },
      });

    await waitForFileReady('node-1', 5, 1);

    expect(useConversionQueueStore.getState().collapsed).toBe(false);
    expect(useConversionQueueStore.getState().autoDismissable).toBe(true);
  });

  it('节点 FAILED（打开链路失败保留真实文件）：失败短路同样不触达面板', async () => {
    mockNodeControllerGetNode.mockResolvedValue({
      data: { fileStatus: 'FAILED' },
    });

    await expect(waitForFileReady('node-1', 5, 1)).rejects.toThrow(
      '该文件转换失败，请检查文件内容'
    );
    expect(useConversionQueueStore.getState().collapsed).toBe(true);
    expect(mockListTasks).not.toHaveBeenCalled();
  });
});

/**
 * 转换等待期不再锁编辑器（转换面板提供进度反馈）+ 打开前复查守卫。
 * 回归目标：解锁后转换完成自动打开不得静默丢弃用户在等待窗口内做的编辑。
 */
describe('转换等待期解锁 + 打开前 guardBeforeOpen 复查', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 登录用户：waitForFileReady 的 refreshCloud token 门控放行
    localStorage.setItem('accessToken', 'test-token');
    mockListTasks.mockResolvedValue({
      error: undefined,
      data: { tasks: [], total: 0 },
    });
    useConversionQueueStore.setState({ tasks: [] });
  });

  it('handlePublicUpload：上传完成后立即摘遮罩（转换等待期不锁编辑器）', async () => {
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: false } });
    mockUploadMxCadFile.mockResolvedValue(undefined);

    const uploadPromise = handlePublicUpload(makeFile('drawing.dwg'));
    // SSE 建连发生在上传完成之后（waitPublicFileConverted）
    await vi.waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    // 遮罩只覆盖哈希+上传：show 一次、hide 一次，且 hide 在上传完成之后
    // （即 SSE 转换等待期间 globalLoading 已为 false，编辑器可交互）
    expect(mockShowGlobalLoading).toHaveBeenCalledTimes(1);
    expect(mockHideGlobalLoading).toHaveBeenCalledTimes(1);
    expect(mockHideGlobalLoading.mock.invocationCallOrder[0]!).toBeGreaterThan(
      mockUploadMxCadFile.mock.invocationCallOrder[0]!
    );

    // 收尾：SSE 终态让 promise 正常结束
    MockEventSource.instances[0].send('FAILED', 'hash123');
    await uploadPromise;
  });

  it('openUploadedFile：转换等待中用户取消未保存守卫 → 不打开、不抛错', async () => {
    mockCheckUnsaved.mockResolvedValueOnce(false);
    mockNodeControllerGetNode.mockResolvedValue({
      data: {
        fileHash: 'h',
        path: '/p',
        name: 'a.dwg',
        parentId: 'parent-1',
      },
    });
    mockNodeControllerGetRootNode.mockResolvedValue({ data: null });

    await expect(openUploadedFile('node-1', 'target-1')).resolves.toBeUndefined();

    expect(mockCheckUnsaved).toHaveBeenCalled();
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('openUploadedFile：守卫通过 → 打开；守卫在 openFile 前、loading 只在打开时显示（等待期不显示）', async () => {
    mockNodeControllerGetNode.mockResolvedValue({
      data: {
        fileHash: 'h',
        path: '/p',
        name: 'a.dwg',
        parentId: 'parent-1',
      },
    });
    mockNodeControllerGetRootNode.mockResolvedValue({ data: null });
    mockOpenFile.mockResolvedValue(undefined);

    await openUploadedFile('node-1', 'target-1');

    expect(mockOpenFile).toHaveBeenCalledTimes(1);
    // 守卫先于打开执行
    expect(mockCheckUnsaved.mock.invocationCallOrder[0]!).toBeLessThan(
      mockOpenFile.mock.invocationCallOrder[0]!
    );
    // 等待期不显示遮罩：唯一的 show 发生在节点查询（等待）之后
    expect(mockShowGlobalLoading).toHaveBeenCalledTimes(1);
    expect(mockShowGlobalLoading.mock.invocationCallOrder[0]!).toBeGreaterThan(
      mockNodeControllerGetNode.mock.invocationCallOrder[0]!
    );
  });

  it('公开路径打开回调：用户取消守卫 → 任务置 cancelled（终态，面板不卡 processing）、不打开', async () => {
    console.log('[DBG7] emit calls at test start:', mockEmit.mock.calls.length);
    mockCalculateFileHash.mockResolvedValue('hash123');
    mockCheckFileExist.mockResolvedValue({ data: { exists: true } });
    mockCheckUnsaved.mockResolvedValueOnce(false);

    await handlePublicUpload(makeFile('drawing.dwg'));

    const allLocal = useConversionQueueStore
      .getState()
      .tasks.filter((t) => t.source === 'local');
    console.log('[DBG6] local tasks count:', allLocal.length, allLocal.map((t) => t.id));
    console.log('[DBG10] emit calls after upload:', mockEmit.mock.calls.length);
    if (mockEmit.mock.calls.length) {
      const cb0 = (mockEmit.mock.calls[0]?.[1] as { callback: () => Promise<void> }).callback;
      console.log('[DBG10] cb0 source:', cb0.toString().slice(0, 120));
    }
    const localTask = allLocal[allLocal.length - 1]!;
    await capturedCallback();
    const afterAll = useConversionQueueStore
      .getState()
      .tasks.filter((t) => t.source === 'local');
    console.log('[DBG6] after cb:', afterAll.map((t) => [t.id, t.status]));

    const after = useConversionQueueStore
      .getState()
      .tasks.find((t) => t.id === localTask.id)!;
    expect(after.status).toBe('cancelled');
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('本地 mxweb 打开：守卫取消 → 不打开、清遮罩（入口从未查过未保存，打开点是唯一检查点）', async () => {
    mockCheckUnsaved.mockResolvedValueOnce(false);
    mockCalculateFileHash.mockResolvedValue('localhash');
    installFakeIndexedDB();

    await handleOpenFileCommand();
    const picker = document.getElementById(
      'mx-cad-file-picker'
    ) as HTMLInputElement;
    Object.defineProperty(picker, 'files', { value: [makeFile('a.mxweb')] });
    await picker.onchange?.({ target: picker } as unknown as Event);

    expect(mockCheckUnsaved).toHaveBeenCalled();
    expect(mockOpenFile).not.toHaveBeenCalled();
    expect(mockHideGlobalLoading).toHaveBeenCalled();
  });
});

/**
 * openLocalMxwebFile 的 IndexedDB 最小 fake：open/get 均以微任务触发 onsuccess，
 * get 返回 truthy（缓存命中 → needsWrite=false，跳过 arrayBuffer 写入路径）。
 */
function installFakeIndexedDB(): void {
  const req = (result?: unknown) => {
    const r: {
      onsuccess?: () => void;
      onerror?: () => void;
      result?: unknown;
    } = { result };
    queueMicrotask(() => r.onsuccess?.());
    return r;
  };
  const db = {
    transaction: () => ({
      objectStore: () => ({
        get: () => req(new Uint8Array(1)),
        put: () => req(),
      }),
    }),
    close: vi.fn(),
  };
  (globalThis as Record<string, unknown>).indexedDB = { open: () => req(db) };
}
