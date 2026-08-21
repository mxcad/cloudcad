import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * vipCommandGuard — VIP 命令前置门控单元测试
 *
 * 被测模块持有模块级状态（installed / initQuickCommand），
 * 不导出内部实现，因此每个用例通过 vi.resetModules() + 动态 import 获取全新模块实例。
 * mxdraw 在 vitest 中别名到空模块（src/test/__mocks__/empty.ts），
 * 因此 vi.mock('mxdraw') 提供包含 store.state.MxFun 的假对象供 guard 打补丁。
 */
const mocks = vi.hoisted(() => ({
  handleVipFeatureRequiredError: vi.fn(),
  getQueryData: vi.fn(),
  globalShowToast: vi.fn(),
  mxdraw: {
    MxFun: {},
    store: {
      state: {
        MxFun: null as { sendStringToExecute: unknown; initQuickCommand: unknown } | null,
      },
    },
  },
}));

vi.mock('mxdraw', () => ({
  MxFun: mocks.mxdraw.MxFun,
  store: mocks.mxdraw.store,
}));
vi.mock('@/utils/vipFeatureGuide', () => ({
  handleVipFeatureRequiredError: mocks.handleVipFeatureRequiredError,
}));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: mocks.globalShowToast,
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { getQueryData: mocks.getQueryData },
}));
vi.mock('@/languages', () => ({ t: (key: string) => key }));

type VipCommandGuardModule = typeof import('./vipCommandGuard');

let fakeMxFun: {
  sendStringToExecute: ReturnType<typeof vi.fn>;
  initQuickCommand: ReturnType<typeof vi.fn>;
};
/** 原始实现引用：guard 以 defineProperty 覆写属性后，断言须从原始 mock 上读取 */
let originalSend: ReturnType<typeof vi.fn>;
let originalInit: ReturnType<typeof vi.fn>;

/** 安装 guard 并返回模块（每次调用前重置模块注册表，避免跨用例状态污染） */
async function loadInstalled(): Promise<VipCommandGuardModule> {
  vi.resetModules();
  const mod = await import('./vipCommandGuard');
  mod.installVipCommandGuard();
  return mod;
}

describe('vipCommandGuard', () => {
  beforeEach(() => {
    mocks.handleVipFeatureRequiredError.mockReset();
    mocks.getQueryData.mockReset().mockReturnValue({ freeExportDownloadEnabled: false });
    mocks.globalShowToast.mockReset();

    originalSend = vi.fn().mockReturnValue(true);
    originalInit = vi.fn();
    fakeMxFun = {
      sendStringToExecute: originalSend,
      initQuickCommand: originalInit,
    };
    mocks.mxdraw.store.state.MxFun = fakeMxFun;

    localStorage.clear();
  });

  afterEach(() => {
    mocks.mxdraw.store.state.MxFun = null;
  });

  it('安装后覆写 store.state.MxFun 的两个入口方法并冻结对象（幂等：重复安装不重复包装）', async () => {
    const mod = await loadInstalled();
    mod.installVipCommandGuard(); // 再次安装应被 installed 标记挡下

    await fakeMxFun.sendStringToExecute('Mx_Undo');
    await fakeMxFun.sendStringToExecute('Mx_Undo');
    // 每个调用只透传一次到底层（未被双重包装）
    expect(originalSend.mock.calls.length).toBe(2);
    expect(originalInit.mock.calls.length).toBe(0);
    expect(Object.isFrozen(mocks.mxdraw.store.state.MxFun)).toBe(true);
  });

  it('非 VIP 命令直接透传底层 sendStringToExecute', async () => {
    await loadInstalled();
    const result = await fakeMxFun.sendStringToExecute('Mx_Undo');
    expect(result).toBe(true);
    expect(originalSend.mock.calls[0][0]).toBe('Mx_Undo');
    expect(mocks.handleVipFeatureRequiredError).not.toHaveBeenCalled();
    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });

  it('VIP 命令：非会员（含游客）拦截，不执行原命令，提示错误并复用购买弹窗', async () => {
    await loadInstalled();
    await fakeMxFun.sendStringToExecute('Mx_ExportDWG');

    // 原实现未被调用（命令未发往引擎）
    expect(originalSend.mock.results).toEqual([]);
    expect(mocks.globalShowToast).toHaveBeenCalledWith('导出下载为会员专属功能', 'error');
    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledTimes(1);
    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledWith(
      undefined,
      '导出下载为会员专属功能，开通 VIP 后即可使用'
    );
  });

  it('VIP 命令：会员用户放行并执行原命令', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ membershipTierLevel: 2, membershipExpiresAt: null })
    );
    await loadInstalled();

    await fakeMxFun.sendStringToExecute('Mx_ExportDWG');
    expect(originalSend.mock.calls[0][0]).toBe('Mx_ExportDWG');
    expect(originalSend.mock.results[0].value).toBe(true);
    expect(mocks.handleVipFeatureRequiredError).not.toHaveBeenCalled();
    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });

  it('VIP 命令：会员到期（expiresAt 已过）按非会员拦截', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        membershipTierLevel: 1,
        membershipExpiresAt: new Date(Date.now() - 86400_000).toISOString(),
      })
    );
    await loadInstalled();

    await fakeMxFun.sendStringToExecute('Mx_ExportPDF');
    expect(originalSend.mock.results).toEqual([]);
    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledTimes(1);
  });

  it('VIP 命令：freeExportDownloadEnabled 开关开放时非会员也放行（后端仍有门控兜底）', async () => {
    mocks.getQueryData.mockReturnValue({ freeExportDownloadEnabled: true });
    await loadInstalled();

    await fakeMxFun.sendStringToExecute('Mx_ExportDXF');
    expect(originalSend.mock.results[0].value).toBe(true);
    expect(mocks.handleVipFeatureRequiredError).not.toHaveBeenCalled();
  });

  it('initQuickCommand 记录命令组：组内子命令随组首的 VIP 命令一并门控', async () => {
    await loadInstalled();

    await fakeMxFun.initQuickCommand([['Mx_PrintDialog', 'print_sub'], ['Mx_Undo']]);
    // 组首为 VIP 命令 → 组内子命令受门控
    await fakeMxFun.sendStringToExecute('print_sub');
    expect(originalSend.mock.results).toEqual([]);
    expect(mocks.handleVipFeatureRequiredError).toHaveBeenCalledTimes(1);

    // 非 VIP 组命令不受影响（print_sub 被拦截，底层仅记录 undo_sub 这一次调用)
    await fakeMxFun.sendStringToExecute('undo_sub');
    expect(originalSend.mock.calls).toHaveLength(1);
    expect(originalSend.mock.calls[0][0]).toBe('undo_sub');
  });

  it('门控命令清单与 VIP 图标替换同源（各导出格式 + 打印 + 剪切DWG，含参考实现对照的 Mx_PrintDialog）', async () => {
    const { VIP_EXPORT_COMMANDS } = await import('./applyVipExportIcons');
    expect(VIP_EXPORT_COMMANDS).toEqual([
      'Mx_ExportPDF',
      'Mx_ExportDWG',
      'Mx_ExportDXF',
      'showDWGCutDialog',
      'Mx_PrintDialog',
    ]);
    expect(VIP_EXPORT_COMMANDS).toContain('Mx_PrintDialog');
  });
});