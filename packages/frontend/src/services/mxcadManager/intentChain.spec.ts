import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PENDING_INTENT_KEY } from '@cloudcad/platform';
import { CAD_EVENTS } from '@/constants/events';

/**
 * intentChain —— PC adapter 单元测试（ADR-0081）。
 *
 * 判定与持久化语义是平台层纯状态机，已在 packages/platform 覆盖；这里只验证端侧
 * 接线：sessionStorage 介质、登录闸门事件、命令分发、会话回填、VIP 闸门引导。
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
  exportAllowed: false,
  vipGuideConfirmed: false,
  emit: vi.fn(),
  patchSession: vi.fn(),
  patchSessionFlags: vi.fn(),
  handleError: vi.fn(),
  handleVipFeatureRequiredError: vi.fn(),
  buildCommandContext: vi.fn(async () => ({})),
  executeCommand: vi.fn(async () => ({ success: true })),
  engineSend: vi.fn(),
  mxdraw: {
    MxFun: {} as Record<string, unknown>,
    store: {
      state: {
        MxFun: null as { sendStringToExecute: unknown } | null,
      },
    },
  },
}));

vi.mock('mxdraw', () => ({
  MxFun: mocks.mxdraw.MxFun,
  store: mocks.mxdraw.store,
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
vi.mock('@/utils/vipFeatureGuide', () => ({
  handleVipFeatureRequiredError: mocks.handleVipFeatureRequiredError,
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
  CommandRegistry: {
    execute: mocks.executeCommand,
    has: (name: string) => !name.startsWith('show') && name !== 'Mx_PrintDialog',
  },
}));
vi.mock('./cmd/rebindMxCommands', () => ({
  buildCommandContext: mocks.buildCommandContext,
}));
vi.mock('./applyVipExportIcons', () => ({
  VIP_EXPORT_COMMANDS: ['Mx_ExportDWG', 'showDWGCutDialog'],
}));
vi.mock('./exportGate', () => ({
  isExportDownloadAllowed: () => mocks.exportAllowed,
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
  mocks.exportAllowed = false;
  mocks.vipGuideConfirmed = false;
  // 动态读标志：vip-blocked 分支的购买引导按调用时刻的确认结果结算
  mocks.handleVipFeatureRequiredError.mockImplementation(
    () => Promise.resolve(mocks.vipGuideConfirmed)
  );
  mocks.mxdraw.store.state.MxFun = null;
});

describe('beginIntent(SHARE_CHAIN) —— 挂起意图并按前置顺序决定下一步', () => {
  it('未登录 → 挂起意图 + 请求登录闸门（SAVE_REQUIRED kind=share）', async () => {
    const mod = await load();
    mocks.authenticated = false;

    expect(await mod.beginIntent(mod.SHARE_CHAIN)).toBe('auth-blocked');

    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'share',
    });
    expect(mod.hasIntentChain()).toBe(true);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('token 过期视同未登录', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.tokenExpired = true;

    expect(await mod.beginIntent(mod.SHARE_CHAIN)).toBe('auth-blocked');
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('已登录但无云端节点 + 拒绝确认 → cancelled 且链已清除', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = false;

    expect(await mod.beginIntent(mod.SHARE_CHAIN)).toBe('cancelled');
    expect(mod.hasIntentChain()).toBe(false);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('已登录但无云端节点 + 确认 → cloud-save-pending 并派发 Mx_SaveToCloud', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;

    expect(await mod.beginIntent(mod.SHARE_CHAIN)).toBe('cloud-save-pending');

    // 链保留，等另存为回报
    expect(mod.hasIntentChain()).toBe(true);
    await flush();
    expect(mocks.executeCommand).toHaveBeenCalledWith('Mx_SaveToCloud', {});
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('前置已满足时不该被调用 → cancelled 且不留挂起链', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.fileId = 'node-1';

    expect(await mod.beginIntent(mod.SHARE_CHAIN)).toBe('cancelled');
    expect(mod.hasIntentChain()).toBe(false);
    await flush();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });
});

describe('beginIntent —— 另存为 / 保存 / 导出链的登录缺口', () => {
  it('SAVE_AS_CHAIN 未登录 → auth-blocked + kind=saveAs', async () => {
    const mod = await load();

    expect(await mod.beginIntent(mod.SAVE_AS_CHAIN)).toBe('auth-blocked');
    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'saveAs',
    });
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('SAVE_CHAIN 未登录 → auth-blocked + kind=save', async () => {
    const mod = await load();

    expect(await mod.beginIntent(mod.SAVE_CHAIN)).toBe('auth-blocked');
    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'save',
    });
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('导出链未登录 → auth-blocked + kind=export', async () => {
    const mod = await load();

    expect(
      await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG'])
    ).toBe('auth-blocked');
    expect(mocks.emit).toHaveBeenCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'export',
    });
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('已登录链（auth 前置）前置已满足 → cancelled 且不留挂起链', async () => {
    const mod = await load();
    mocks.authenticated = true;

    expect(await mod.beginIntent(mod.SAVE_AS_CHAIN)).toBe('cancelled');
    expect(mod.hasIntentChain()).toBe(false);
  });
});

describe('beginIntent —— 导出链的会员缺口', () => {
  it('已登录但闸门未过 → vip-blocked + 弹购买引导，链保留', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.exportAllowed = false;
    mocks.vipGuideConfirmed = true;

    expect(
      await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG'])
    ).toBe('vip-blocked');
    expect(mod.hasIntentChain()).toBe(true);
    await flush();
    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledTimes(1);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  it('用户取消购买引导 → 清链（放弃意图，不再重复弹引导）', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.vipGuideConfirmed = false;
    mocks.handleVipFeatureRequiredError.mockResolvedValue(false);

    expect(
      await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG'])
    ).toBe('vip-blocked');
    await flush();
    expect(mod.hasIntentChain()).toBe(false);
  });

  it('闸门已放行（充值/开放免费导出）→ cancelled 且不留挂起链', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.exportAllowed = true;

    expect(
      await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG'])
    ).toBe('cancelled');
    expect(mod.hasIntentChain()).toBe(false);
  });
});

describe('resumeIntent —— 锚点续跑（ADR-0081 D4/D5）', () => {
  it('无挂起链 → 幂等返回，不分发任何命令', async () => {
    const mod = await load();

    mod.resumeIntent();
    await flush();

    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('挂起的是任意意图 → 前置满足即续跑并清链', async () => {
    const mod = await load();
    mocks.authenticated = true;
    sessionStorage.setItem(
      PENDING_INTENT_KEY,
      JSON.stringify({
        id: 'save-to-cloud',
        action: { type: 'Mx_Save' },
        preconditions: ['auth'],
        resumeAfter: 'document-loaded',
      })
    );

    mod.resumeIntent();
    await flush();

    expect(mocks.executeCommand).toHaveBeenCalledWith('Mx_Save', {});
    expect(sessionStorage.getItem(PENDING_INTENT_KEY)).toBeNull();
  });

  it('认证仍缺失 → 交回登录闸门、不执行动作、链保留（D5 不自动重试）', async () => {
    const mod = await load();
    mocks.authenticated = false;
    await mod.beginIntent(mod.SHARE_CHAIN);

    mod.resumeIntent();
    await flush();

    expect(mocks.emit).toHaveBeenLastCalledWith(CAD_EVENTS.SAVE_REQUIRED, {
      kind: 'share',
    });
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('仍无云端节点 → 交回保存到云端，链保留、不进重入标记', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginIntent(mod.SHARE_CHAIN);
    await flush();

    mod.resumeIntent();
    await flush();

    expect(mocks.executeCommand).toHaveBeenLastCalledWith(
      'Mx_SaveToCloud',
      {}
    );
    expect(mod.hasIntentChain()).toBe(true);
    expect(mod.isChainResumeInFlight()).toBe(false);
  });

  it('前置全满足 → 清链 + 执行原始 Mx_Share，重入标记随执行起落', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginIntent(mod.SHARE_CHAIN);
    await flush();

    mocks.fileId = 'node-1';
    mod.resumeIntent();

    expect(mod.hasIntentChain()).toBe(false);
    expect(mod.isChainResumeInFlight()).toBe(true);
    await flush();
    expect(mocks.executeCommand).toHaveBeenLastCalledWith('Mx_Share', {});
    expect(mod.isChainResumeInFlight()).toBe(false);
  });

  it('用户放弃（clearIntentChain）后不再续跑', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginIntent(mod.SHARE_CHAIN);
    await flush();
    expect(mod.hasIntentChain()).toBe(true);
    // 建链那步本身会派发 Mx_SaveToCloud，故只比对增量
    const callsBefore = mocks.executeCommand.mock.calls.length;

    mod.clearIntentChain();
    expect(mod.hasIntentChain()).toBe(false);

    mod.resumeIntent();
    await flush();

    expect(mocks.executeCommand.mock.calls.length).toBe(callsBefore);
    expect(mod.isChainResumeInFlight()).toBe(false);
  });
});

describe('resumeIntent —— 会员闸门翻转续跑（充值成功 / 开放免费导出）', () => {
  it('闸门翻转放行 → 清链 + 执行原始导出命令', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.exportAllowed = false;
    mocks.vipGuideConfirmed = true;
    await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG']);
    await flush();
    expect(mod.hasIntentChain()).toBe(true);

    mocks.exportAllowed = true;
    mod.resumeIntent();

    expect(mod.hasIntentChain()).toBe(false);
    await flush();
    expect(mocks.executeCommand).toHaveBeenLastCalledWith('Mx_ExportDWG', {});
  });

  it('闸门仍未过 → 交回购买引导，链保留', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.exportAllowed = false;
    mocks.vipGuideConfirmed = true;
    await mod.beginIntent(mod.VIP_EXPORT_CHAINS['Mx_ExportDWG']);
    await flush();

    mocks.handleVipFeatureRequiredError.mockClear();
    mod.resumeIntent();
    await flush();

    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledTimes(1);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mod.hasIntentChain()).toBe(true);
  });

  it('引擎原生命令（showDWGCutDialog）→ 直发引擎而非 CommandRegistry', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.exportAllowed = false;
    mocks.vipGuideConfirmed = true;
    await mod.beginIntent(mod.VIP_EXPORT_CHAINS['showDWGCutDialog']);
    await flush();

    mocks.exportAllowed = true;
    mocks.mxdraw.store.state.MxFun = { sendStringToExecute: mocks.engineSend };
    mod.resumeIntent();
    await flush();

    expect(mocks.engineSend).toHaveBeenCalledWith('showDWGCutDialog');
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mod.hasIntentChain()).toBe(false);
  });
});

describe('signalShareChainCloudNodeCreated —— 另存为回报（ADR-0081 D6）', () => {
  it('回填会话 + 清链 + 执行原始 Mx_Share，返回 true', async () => {
    const mod = await load();
    mocks.authenticated = true;
    mocks.confirmResult = true;
    await mod.beginIntent(mod.SHARE_CHAIN);
    await flush();

    const consumed = mod.signalShareChainCloudNodeCreated({
      nodeId: 'node-9',
      fileName: 'a.mxweb',
      projectId: 'proj-2',
      parentId: 'parent-1',
    });

    expect(consumed).toBe(true);
    expect(mod.hasIntentChain()).toBe(false);
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
    await mod.beginIntent(mod.SHARE_CHAIN);
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
    await mod.beginIntent(mod.SHARE_CHAIN);
    await flush();

    expect(
      mod.signalShareChainCloudNodeCreated({
        nodeId: '',
        fileName: 'a.mxweb',
        parentId: 'parent-1',
      })
    ).toBe(false);
    expect(mocks.patchSession).not.toHaveBeenCalled();
    expect(mod.hasIntentChain()).toBe(true);
  });
});
