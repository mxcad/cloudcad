import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from './types';
import type { Command, CommandResult } from './types';

/**
 * rebindMxCommands 失败反馈中心化测试。
 *
 * rebindMxCommands() 是唯一的失败反馈消费点：对每个命令 execute 后的
 * `!success` 结果统一 toast（message/severity），`silent:true` 静默。
 * 断言「命令返回值 → 分发层 toast 行为」的映射。
 */
const mocks = vi.hoisted(() => ({
  addCommand: vi.fn(),
  globalShowToast: vi.fn(),
  getFileInfo: vi.fn(),
  saveCurrentDrawingToBlob: vi.fn(),
  saveCurrentFile: vi.fn(),
  createDefaultSaveDeps: vi.fn(),
}));

vi.mock('mxdraw', () => ({ MxFun: { addCommand: mocks.addCommand } }));
vi.mock('@/languages', () => ({ t: (key: string) => key }));
vi.mock('@/utils/notificationEvents', () => ({
  globalShowToast: mocks.globalShowToast,
  globalShowConfirm: vi.fn(),
}));
vi.mock('../mxcadHelpers', () => ({
  getFileInfo: mocks.getFileInfo,
  saveCurrentDrawingToBlob: mocks.saveCurrentDrawingToBlob,
}));
vi.mock('../saveFile', () => ({
  saveCurrentFile: mocks.saveCurrentFile,
  createDefaultSaveDeps: mocks.createDefaultSaveDeps,
}));

/** 替换命令表与 execute（单例内部 Map 未注册 mock 命令，须一并 mock execute） */
function setupCommands(results: CommandResult[]): void {
  const commands: Command[] = results.map((result, i) => ({
    name: `cmd-${i}`,
    execute: vi.fn().mockResolvedValue(result),
  }));
  vi.spyOn(CommandRegistry, 'getAll').mockReturnValue(commands);
  vi.spyOn(CommandRegistry, 'execute').mockImplementation(async (name) => {
    const cmd = commands.find((c) => c.name === name);
    return cmd ? cmd.execute({} as never) : { success: false, error: 'not found' };
  });
}

/** 触发 rebindMxCommands 注册的全部引擎回调（每个回调 = 一次命令执行） */
async function runRebind(): Promise<void> {
  const { rebindMxCommands } = await import('./rebindMxCommands');
  rebindMxCommands();
  const callbacks = mocks.addCommand.mock.calls.map(
    ([, cb]) => cb as () => Promise<void>
  );
  for (const cb of callbacks) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFileInfo.mockReturnValue(null);
  mocks.createDefaultSaveDeps.mockReturnValue({ sdk: {}, permissions: {} });
});

describe('rebindMxCommands 失败反馈中心化', () => {
  it('success:false 无 message → toast 通用文案 + error', async () => {
    setupCommands([{ success: false, error: 'boom' }]);

    await runRebind();

    expect(mocks.addCommand).toHaveBeenCalledTimes(1);
    expect(mocks.globalShowToast).toHaveBeenCalledWith('操作失败', 'error');
  });

  it('success:false + message → toast 自定义文案（不另配默认）', async () => {
    setupCommands([{ success: false, error: 'boom', message: '自定义' }]);

    await runRebind();

    expect(mocks.globalShowToast).toHaveBeenCalledWith('自定义', 'error');
  });

  it('success:false + severity:warning → toast 该级别', async () => {
    setupCommands([
      {
        success: false,
        error: 'file-opening',
        message: '图纸正在打开，请稍后再保存',
        severity: 'warning',
      },
    ]);

    await runRebind();

    expect(mocks.globalShowToast).toHaveBeenCalledWith(
      '图纸正在打开，请稍后再保存',
      'warning'
    );
  });

  it('success:false + silent:true → 不 toast（用户主动取消）', async () => {
    setupCommands([{ success: false, error: 'cancelled', silent: true }]);

    await runRebind();

    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });

  it('success:true → 不 toast', async () => {
    setupCommands([{ success: true }]);

    await runRebind();

    expect(mocks.globalShowToast).not.toHaveBeenCalled();
  });

  it('多命令混合 → 只 toast 非 silent 的失败', async () => {
    setupCommands([
      { success: false, error: 'a' },
      { success: false, error: 'b', message: 'B' },
      { success: false, error: 'c', silent: true },
      { success: true },
    ]);

    await runRebind();

    expect(mocks.addCommand).toHaveBeenCalledTimes(4);
    expect(mocks.globalShowToast).toHaveBeenCalledTimes(2);
    expect(mocks.globalShowToast).toHaveBeenNthCalledWith(1, '操作失败', 'error');
    expect(mocks.globalShowToast).toHaveBeenNthCalledWith(2, 'B', 'error');
  });
});
