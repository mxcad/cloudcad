import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PENDING_INTENT_KEY } from '@cloudcad/platform';
import { CAD_EVENTS } from '@/constants/events';

/**
 * intentChain —— PC adapter 单元测试（ADR-0081）。
 *
 * 判定与持久化语义是平台层纯状态机，已在 packages/platform 覆盖；这里只验证端侧
 * 接线：sessionStorage 介质、登录闸门事件、命令分发、会话回填。
 *
 * 模块持有 `chainResumeInFlight` 状态，故每例 resetModules + 动态 import 取全新
 * 实例（同 vipCommandGuard.spec 的既有模式）。`buildCommandContext` 会动态引入
 * saveFile 整链，整体 mock 掉。
 */
const mocks = vi.hoisted(() => ({
  authenticated: false,
  tokenExpired: false,
  fileId: null as string | null,
  fileName: null as string | null,
  confirmResult: false,
  emit: vi.fn(),
  patchSession: vi.fn(),
  patchSessionFlags: vi.fn(),
  handleError: vi.fn(),
  buildCommandContext: vi.fn(async () => ({})),
  executeCommand: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/utils/authCheck', () => ({
  isAuthenticated: () => mocks.authenticated,
}));
vi.mock('@/utils/tokenUtils', () => ({
  isAccessTokenExpired: () => mocks.tokenExpired,
}));
vi.mock('@/utils/errorHandler', () => ({ handleError: mocks.handleError }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowConfirm: () => mocks.confirmResult,
  globalShowToast: vi.fn(),
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
vi.mock('../drawingSession', () => ({
  emit: mocks.emit,
  patchSession: mocks.patchSession,
  patchSessionFlags: mocks.patchSessionFlags,
}));
vi.mock('./cmd/types', () => ({
  CommandRegistry: { execute: mocks.executeCommand },
}));
vi.mock('./cmd/rebindMxCommands', () => ({
  buildCommandContext: mocks.buildCommandContext,
}));

type IntentChainModule = typeof import('./intentChain');

async function load(): Promise<IntentChainModule> {
  vi.resetModules();
  return import('./intentChain');
}

/** 分发命令是 fire-and-forget 的异步，断言前需要让微任务跑完 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.authenticated = false;
  mocks.tokenExpired = false;
  mocks.fileId = null;
  mocks.fileName = null;
  mocks.confirmResult = false;
});

describe('beginShareChain —— 挂起意图并按前置顺序决定下一步', () => {
  it('未登录 → 挂起意图 + 请求登录闸门（SAVE_REQUIRED kind=share）', async () => {
    const mod = await load();
    mocks.authenticated = false;

    expect(await mod.beginShareChain()).toBe('auth-blocked');

    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'share',
    });
    expect(mod.hasShareChain()).toBe(true);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('token 过期视同未登录', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.tokenExpired = true;

    expect(await mod.beginShareChain()).toBe('auth-blocked');
    expect(mod.hasShareChain()).toBe(true);
  });

  it('已登录但无云端节点 + 拒绝确认 → cancelled 且链已清除', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = false;

    expect(await mod.beginShareChain()).toBe('cancelled');
    expect(mod.hasShareChain()).toBe(false);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('已登录但无云端节点 + 确认 → cloud-save-pending 并派发 Mx_SaveToCloud', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;

    expect(await mod.beginShareChain()).toBe('cloud-save-pending');

    // 链保留，等另存为回报
    expect(mod.hasShareChain()).toBe(true);
    await flush();
    expect(mocks.executeCommand).toHaveBeenCalledWith('Mx_SaveToCloud', {});
    expect(mod.hasShareChain()).toBe(true);
  });

  it('前置已满足时不该被调用 → cancelled 且不留挂起链', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.fileId = 'node-1';

    expect(await mod.beginShareChain()).toBe('cancelled');
    expect(mod.hasShareChain()).toBe(false);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });
});

describe('resumeShareChain —— 锚点续跑（ADR-0081 D4/D5）', () => {
  it('无挂起链 → 幂等返回，不分发任何命令', async () => {
    const mod = await load();

    mod.resumeShareChain();
    await flush();

    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('挂起的是其他意图 → 忽略且不代为清理', async () => {
    const mod = await load();
    sessionStorage.setItem(
      PENDING_INTENT_KEY,
      JSON.stringify({
        id: 'other-chain',
        action: { type: 'Mx_Save' },
        preconditions: ['auth'],
        resumeAfter: 'document-loaded',
      })
    );

    mod.resumeShareChain();
    await flush();

    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_INTENT_KEY)).not.toBeNull();
  });

  it('认证仍缺失 → 交回登录闸门、不执行动作、链保留（D5 不自动重试）', async () => {
    const mod = await load();
    mocks.authenticated = false;
    await mod.beginShareChain();

    mod.resumeShareChain();
    await flush();

    expect(mocks.emit).toHaveBeenLastCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'share',
    });
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mod.hasShareChain()).toBe(true);
  });

  it('仍无云端节点 → 交回保存到云端，链保留、不进重入标记', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();

    mod.resumeShareChain();
    await flush();

    expect(mocks.executeCommand).toHaveBeenLastCalledWith(
      'Mx_SaveToCloud',
      {}
    );
    expect(mod.hasShareChain()).toBe(true);
    expect(mod.isShareChainResumeInFlight()).toBe(false);
  });

  it('前置全满足 → 清链 + 执行原始 Mx_Share，重入标记随执行起落', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();

    mocks.fileId = 'node-1';
    mod.resumeShareChain();

    expect(mod.hasShareChain()).toBe(false);
    expect(mod.isShareChainResumeInFlight()).toBe(true);
    await flush();
    expect(mocks.executeCommand).toHaveBeenLastCalledWith('Mx_Share', {});
    expect(mod.isShareChainResumeInFlight()).toBe(false);
  });

  it('用户放弃（clearShareChain）后不再续跑', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();
    expect(mod.hasShareChain()).toBe(true);
    // 建链那步本身会派发 Mx_SaveToCloud，故只比对增量
    const callsBefore = mocks.executeCommand.mock.calls.length;

    mod.clearShareChain();
    expect(mod.hasShareChain()).toBe(false);

    mod.resumeShareChain();
    await flush();

    expect(mocks.executeCommand.mock.calls.length).toBe(callsBefore);
    expect(mod.isShareChainResumeInFlight()).toBe(false);
  });
});

describe('signalShareChainCloudNodeCreated —— 另存为回报（ADR-0081 D6）', () => {
  it('回填会话 + 清链 + 执行原始 Mx_Share，返回 true', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();

    const consumed = mod.signalShareChainCloudNodeCreated({
      nodeId: 'node-9',
      fileName: 'a.mxweb',
      projectId: 'proj-2',
      parentId: 'parent-1',
    });

    expect(consumed).toBe(true);
    expect(mod.hasShareChain()).toBe(false);
    expect(mocks.patchSession).toHaveBeenCalledWith({
      fileId: 'node-9',
      parentId: 'parent-1',
      projectId: 'proj-2',
      name: 'a.mxweb',
    });
    expect(mocks.patchSessionFlags).toHaveBeenCalledWith({
      fileId: 'node-9',
      fileName: 'a.mxweb',
    });
    await flush();
    expect(mocks.executeCommand).toHaveBeenLastCalledWith('Mx_Share', {});
  });

  it('projectId 缺省 → 回填 null（不猜 personalSpaceId）', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();

    expect(
      mod.signalShareChainCloudNodeCreated({
        nodeId: 'node-9',
        fileName: 'a.mxweb',
        parentId: 'parent-1',
      })
    ).toBe(true);
    expect(mocks.patchSession).toHaveBeenCalledWith({
      fileId: 'node-9',
      parentId: 'parent-1',
      projectId: null,
      name: 'a.mxweb',
    });
  });

  it('无挂起链 → 返回 false 且不回填', async () => {
    const mod = await load();

    expect(
      mod.signalShareChainCloudNodeCreated({
        nodeId: 'node-9',
        fileName: 'a.mxweb',
        parentId: 'parent-1',
      })
    ).toBe(false);
    expect(mocks.patchSession).not.toHaveBeenCalled();
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('空 nodeId → 返回 false，链不被消费', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginShareChain();
    await flush();

    expect(
      mod.signalShareChainCloudNodeCreated({
        nodeId: '',
        fileName: 'a.mxweb',
        parentId: 'parent-1',
      })
    ).toBe(false);
    expect(mocks.patchSession).not.toHaveBeenCalled();
    expect(mod.hasShareChain()).toBe(true);
  });
});
