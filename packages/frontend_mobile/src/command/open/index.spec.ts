import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FilePickerResult } from '@/composables/useNativeFilePicker';

/**
 * 「打开文件」命令编排契约测试。
 *
 * 锁定核心不变量：.dwg/.dxf 必须先拿到转换终态（waitPublicConversion 返回
 * COMPLETED）才能调 openMxWeb。access 端点按 hash 查 uploads/ 里的 mxweb，未就位
 * 直接 404，引擎只会报成「打开图纸失败」——这正是改造前移动端的行为。
 * .mxweb 是源格式，走 blob URL 就地打开，全程不碰上传与转换。
 *
 * 命令处理器不导出，通过 mock 命令注册表捕获 addCommand 的注册来驱动。
 */

const {
  addCommandMock,
  showFilePickerMock,
  openMxWebMock,
  waitPublicConversionMock,
  checkExtRefsMock,
  toastMock,
  guardMock,
} = vi.hoisted(() => ({
  addCommandMock: vi.fn(),
  showFilePickerMock: vi.fn(
    (_cb: (result: FilePickerResult) => unknown, _noCache?: boolean) => undefined
  ),
  openMxWebMock: vi.fn(
    async (_url: string, _options?: { fetchAttributes?: number }) => true
  ),
  waitPublicConversionMock: vi.fn(async () => 'COMPLETED'),
  checkExtRefsMock: vi.fn(async () => true),
  toastMock: vi.fn(),
  guardMock: vi.fn(async () => true),
}));

const editorStateMock = vi.hoisted(() => ({
  state: { isModified: false },
  resetFileState: vi.fn(),
  setProgressStage: vi.fn(),
  setLoading: vi.fn(),
  setIsActive: vi.fn(),
  setFileName: vi.fn(),
  setIsPublicFile: vi.fn(),
  setFileHash: vi.fn(),
}));

vi.mock('mxcad', () => ({
  FetchAttributes: {
    EMSCRIPTEN_FETCH_LOAD_TO_MEMORY: 1,
    EMSCRIPTEN_FETCH_PERSIST_FILE: 4,
    EMSCRIPTEN_FETCH_APPEND: 8,
    EMSCRIPTEN_FETCH_REPLACE: 16,
  },
}));
vi.mock('@/plugins/mxcad/command', () => ({ addCommand: addCommandMock }));
vi.mock('@/plugins/mxcad/openMxWeb', () => ({ openMxWeb: openMxWebMock }));
vi.mock('@/services/conversionStream', () => ({
  waitPublicConversion: waitPublicConversionMock,
}));
vi.mock('@/composables/useFileLoader', () => ({
  checkPublicFileExternalRefs: checkExtRefsMock,
}));
vi.mock('@/composables/useOpenGuard', () => ({
  useOpenGuard: () => ({ guardBeforeOpen: guardMock }),
}));
vi.mock('@/composables/useNativeFilePicker', () => ({
  showFilePicker: showFilePickerMock,
}));
vi.mock('@/composables/useEditorState', () => ({
  useEditorState: () => editorStateMock,
}));
vi.mock('@/utils/toast', () => ({ showToastOnce: toastMock }));
vi.mock('@/utils/apiConfig', () => ({
  cachedApiUrl: (path: string) => `/api/v1${path}?t=1`,
}));
vi.mock('@/languages', () => ({ t: (s: string) => s }));

import './index';

const HASH_MXWEB = 'a'.repeat(32);
const HASH_DWG = 'b'.repeat(32);
const NO_CACHE_FETCH_ATTRIBUTES = 1 | 4 | 16;

// 在 clearAllMocks 之前取走处理器引用
const handlers = new Map<string, () => void>();
for (const [cmd, fn] of addCommandMock.mock.calls) {
  handlers.set(cmd as string, fn as () => void);
}

function run(cmd: string): void {
  const handler = handlers.get(cmd);
  if (!handler) throw new Error(`未注册命令 ${cmd}`);
  handler();
}

async function pick(
  result: Partial<FilePickerResult> = {},
  cmd = 'OpenDwg'
): Promise<void> {
  const expectedCalls = showFilePickerMock.mock.calls.length + 1;
  run(cmd);
  await vi.waitFor(() =>
    expect(showFilePickerMock).toHaveBeenCalledTimes(expectedCalls)
  );
  const callback = showFilePickerMock.mock.calls[expectedCalls - 1][0];
  await callback({
    hash: HASH_DWG,
    type: 'dwg',
    ext: 'dwg',
    name: 'test.dwg',
    size: 1024,
    file: { name: 'test.dwg', source: new File(['x'], 'test.dwg') },
    isUseServerExistingFile: false,
    ...result,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  editorStateMock.state.isModified = false;
  openMxWebMock.mockResolvedValue(true);
  waitPublicConversionMock.mockResolvedValue('COMPLETED');
  guardMock.mockResolvedValue(true);
});

describe('打开文件命令编排', () => {
  it('注册 OpenDwg 与 OpenDwg_DoNotUseCache 两个命令', () => {
    expect(handlers.has('OpenDwg')).toBe(true);
    expect(handlers.has('OpenDwg_DoNotUseCache')).toBe(true);
  });

  it('未保存更改被用户取消时不弹文件选择器', async () => {
    guardMock.mockResolvedValue(false);

    run('OpenDwg');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showFilePickerMock).not.toHaveBeenCalled();
    expect(openMxWebMock).not.toHaveBeenCalled();
  });

  it('.mxweb 走 blob URL 就地打开：不查转换、不报失败、文件信息落库', async () => {
    await pick({
      hash: HASH_MXWEB,
      type: 'mxweb',
      ext: 'mxweb',
      name: 'test.mxweb',
      file: { name: 'test.mxweb', source: new File(['x'], 'test.mxweb') },
    });

    expect(waitPublicConversionMock).not.toHaveBeenCalled();
    expect(String(openMxWebMock.mock.calls[0][0])).toMatch(/^blob:/);
    expect(editorStateMock.setFileName).toHaveBeenCalledWith('test.mxweb');
    expect(editorStateMock.setFileHash).toHaveBeenCalledWith(HASH_MXWEB);
    expect(editorStateMock.setIsPublicFile).toHaveBeenCalledWith(true);
    expect(editorStateMock.setIsActive).toHaveBeenCalledWith(true);
    expect(toastMock).not.toHaveBeenCalledWith('打开图纸失败');
  });

  it('.dwg 必须等转换 COMPLETED 才打开，URL 带原始扩展名', async () => {
    const settled: string[] = [];
    waitPublicConversionMock.mockImplementation(async () => {
      settled.push('COMPLETED');
      return 'COMPLETED';
    });

    await pick();

    expect(settled).toEqual(['COMPLETED']);
    expect(checkExtRefsMock).toHaveBeenCalledWith(HASH_DWG);
    expect(openMxWebMock.mock.calls[0][0]).toBe(
      `/api/v1/public-file/access/${HASH_DWG}.dwg.mxweb?t=1`
    );
    expect(editorStateMock.setFileName).toHaveBeenCalledWith('test.dwg');
  });

  it('转换失败不打开、不查外部参照，提示转换失败并收起遮罩', async () => {
    waitPublicConversionMock.mockResolvedValue('FAILED');

    await pick();

    expect(openMxWebMock).not.toHaveBeenCalled();
    expect(checkExtRefsMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('转换失败');
    expect(editorStateMock.setLoading).toHaveBeenCalledWith(false);
  });

  it('无缓存打开传入引擎 fetch 标志位；缓存打开不传', async () => {
    await pick();
    expect(openMxWebMock.mock.calls[0][1]?.fetchAttributes).toBeUndefined();

    vi.clearAllMocks();
    await pick({}, 'OpenDwg_DoNotUseCache');
    expect(showFilePickerMock.mock.calls[0][1]).toBe(true);
    expect(openMxWebMock.mock.calls[0][1]).toEqual({
      fetchAttributes: NO_CACHE_FETCH_ATTRIBUTES,
    });
  });

  it('引擎打开失败时提示打开图纸失败、不设活动态，遮罩仍要收起', async () => {
    openMxWebMock.mockResolvedValue(false);

    await pick();

    expect(toastMock).toHaveBeenCalledWith('打开图纸失败');
    expect(editorStateMock.setIsActive).not.toHaveBeenCalled();
    expect(editorStateMock.setLoading).toHaveBeenCalledWith(false);
  });
});
