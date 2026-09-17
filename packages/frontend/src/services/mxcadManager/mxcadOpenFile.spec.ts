import { describe, it, expect, vi, beforeEach } from 'vitest';
// 与 mxcadOpenFile.ts 同源导入（相对路径），确保测试与被测代码引用同一 store 实例
import { useConversionQueueStore } from '../../stores/conversionQueueStore';
import { handlePublicUpload, waitForFileReady } from './mxcadOpenFile';
import { emit } from '../drawingSession';
import { calculateFileHash } from '../../utils/hashUtils';
import { uploadMxCadFile } from '../../utils/mxcadUploadUtils';
import {
  mxcadUploadControllerCheckFileExist,
  conversionTaskControllerListTasks,
  nodeControllerGetNode,
} from '@/api-sdk';

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
  UrlHelper: { buildUrl: vi.fn(() => '') },
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
  useCADEditorStore: vi.fn(() => ({})),
}));
vi.mock('../../stores/fileSystemStore', () => ({
  useFileSystemStore: vi.fn(() => ({})),
}));
vi.mock('../drawingSession', () => ({
  emitFileOpened: vi.fn(),
  setCacheTimestamp: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('./mxcadManager', () => ({ mxcadManager: { openFile: mockOpenFile } }));
vi.mock('./mxcadTypes', () => ({
  DEFAULT_MESSAGES: {},
  FILE_UPLOAD_CONFIG: { chunkSize: 1 },
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
    // 入口 1 次 + 未就绪轮询 2 次 = ≥ 3 次；关键断言：> 1（证明轮询期间重拉，
    // 而非仅入口一次——否则新上传的云端任务（node.taskId 稍后才写入）会被漏掉）
    expect(mockListTasks.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('节点 FAILED：立即抛失败（不再空等满 maxAttempts 报「文件转换未完成」）', async () => {
    // 后端转换失败保留 FAILED 节点（不再硬删）：若继续轮询会空等满 maxAttempts
    // （默认 60×2s=120s）才报「文件转换未完成」，用户误以为还在转换。
    mockNodeControllerGetNode.mockResolvedValue({
      data: { fileStatus: 'FAILED' },
    });

    await expect(waitForFileReady('node-1', 60, 2000)).rejects.toThrow(
      '该文件转换失败，请检查文件内容'
    );
    // 立即失败：只查一次节点，未进入轮询等待
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
