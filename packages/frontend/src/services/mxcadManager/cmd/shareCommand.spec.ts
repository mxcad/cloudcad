import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CAD_EVENTS } from '@/constants/events';

/**
 * ShareCommand 单元测试（ADR-0081 接入点）。
 *
 * 只有「有云端节点 → 直接分享」这一条路径留在命令里；其余情形全部委托意图链。
 * 意图链整体 mock 掉，只断言命令的分派决策与结果映射。
 */
const mocks = vi.hoisted(() => ({
  fileId: null as string | null,
  fileName: null as string | null,
  resumeInFlight: false,
  beginIntent: vi.fn(),
  emit: vi.fn(),
  handleError: vi.fn(),
  globalShowToast: vi.fn(),
}));

vi.mock('@/utils/errorHandler', () => ({ handleError: mocks.handleError }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: mocks.globalShowToast,
  globalShowConfirm: vi.fn(),
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('@/stores/useCADEditorStore', () => ({
  useCADEditorStore: {
    getState: () => ({
      currentFileId: mocks.fileId,
      currentFileName: mocks.fileName,
    }),
  },
}));
vi.mock('../../drawingSession', () => ({ emit: mocks.emit }));
vi.mock('../intentChain', () => ({
  SHARE_CHAIN: {
    id: 'share-current-drawing',
    action: { type: 'Mx_Share' },
    preconditions: ['auth', 'cloud-existence'],
    resumeAfter: 'document-loaded',
  },
  beginIntent: mocks.beginIntent,
  isChainResumeInFlight: () => mocks.resumeInFlight,
}));

type ShareCommandModule = typeof import('./shareCommand');

async function load(): Promise<ShareCommandModule> {
  vi.resetModules();
  return import('./shareCommand');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fileId = null;
  mocks.fileName = null;
  mocks.resumeInFlight = false;
});

describe('ShareCommand', () => {
  it('有云端节点 → 直接发 SHARE_FILE，不进意图链', async () => {
    const { ShareCommand } = await load();
    mocks.fileId = 'node-1';
    mocks.fileName = 'a.mxweb';

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: true,
    });
    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SHARE_FILE, {
      fileId: 'node-1',
      fileName: 'a.mxweb',
    });
    expect(mocks.beginIntent).not.toHaveBeenCalled();
  });

  it('文件名缺省 → 用 untitled 兜底', async () => {
    const { ShareCommand } = await load();
    mocks.fileId = 'node-1';

    await new ShareCommand().execute({} as never);

    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SHARE_FILE, {
      fileId: 'node-1',
      fileName: 'untitled',
    });
  });

  it('无云端节点 + auth-blocked → unauthorized（链已挂起，等登录后续跑）', async () => {
    const { ShareCommand } = await load();
    mocks.beginIntent.mockResolvedValue('auth-blocked');

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: false,
      error: 'unauthorized',
      message: '请先登录后再分享',
    });
    expect(mocks.beginIntent).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('无云端节点 + cancelled → cancelled（用户取消，分发层静默）', async () => {
    const { ShareCommand } = await load();
    mocks.beginIntent.mockResolvedValue('cancelled');

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: false,
      error: 'cancelled',
      silent: true,
    });
  });

  it('无云端节点 + cloud-save-pending → success（后续由另存为回报推进）', async () => {
    const { ShareCommand } = await load();
    mocks.beginIntent.mockResolvedValue('cloud-save-pending');

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: true,
    });
  });

  it('链正在执行原始动作 → 停止推进，避免「确认 → 保存 → 确认」循环', async () => {
    const { ShareCommand } = await load();
    mocks.resumeInFlight = true;

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: false,
      error: 'no-file-id',
      message: '请先保存图纸到云端后再分享',
      severity: 'warning',
    });
    expect(mocks.beginIntent).not.toHaveBeenCalled();
    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });

  it('意图链抛错 → 记录 + success:false + message（分发层统一弹错）', async () => {
    const { ShareCommand } = await load();
    mocks.beginIntent.mockRejectedValue(new Error('boom'));

    expect(await new ShareCommand().execute({} as never)).toEqual({
      success: false,
      error: 'Error: boom',
      message: 'boom',
      severity: 'error',
    });
    expect(mocks.handleError).toHaveBeenCalled();
    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });
});
