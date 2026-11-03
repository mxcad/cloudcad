import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * useOpenGuard.guardBeforeOpen —— 图纸切换/打开新图纸前的未保存更改守卫契约。
 *
 * 关键回归：保存失败（无云端节点 / 无保存权限 / 已删除 → needSaveAs）时**不得静默
 * return false**。旧实现 `return res.success` 让用户点「保存」后弹窗关闭、再无反馈，
 * 看起来像「调用保存方法无效」。对齐 PC checkAndConfirmUnsavedChanges：被拒 → 置
 * saveAsRejectTrigger（home 页面据此弹另存为面板并显示原因），其他失败 → toast 原因。
 */

const {
  save,
  confirmExitCollaborationIfNeeded,
  showConfirmDialog,
  showToast,
  saveAsRejectTrigger,
} = vi.hoisted(() => ({
  save: vi.fn(),
  confirmExitCollaborationIfNeeded: vi.fn(),
  showConfirmDialog: vi.fn(),
  showToast: vi.fn(),
  // ref 接口只需 .value（测试直接断言，无需响应式；vi.hoisted 内不能用外部 ref）
  saveAsRejectTrigger: { value: { reason: '', seq: 0 } },
}));

vi.mock('@/composables/useSave', () => ({
  useSave: () => ({ save }),
}));

vi.mock('@/composables/useSaveAs', () => ({
  saveAsRejectTrigger,
}));

vi.mock('@/composables/useCooperate', () => ({
  confirmExitCollaborationIfNeeded,
}));

vi.mock('vant', () => ({
  showConfirmDialog,
  showToast,
}));

import { useOpenGuard } from './useOpenGuard';
import { useEditorStore } from '@/stores/editor';

function setModified(val: boolean) {
  useEditorStore().state.isModified = val;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  // 默认：协同退出无阻拦、确认框默认「保存」（resolve）
  confirmExitCollaborationIfNeeded.mockResolvedValue(true);
  showConfirmDialog.mockResolvedValue(undefined);
  saveAsRejectTrigger.value = { reason: '', seq: 0 };
});

describe('useOpenGuard.guardBeforeOpen', () => {
  it('无未保存修改 → 直接放行，不弹确认框不调保存', async () => {
    setModified(false);
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(true);
    expect(showConfirmDialog).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('协同退出被取消 → 中止，连未保存确认都不弹', async () => {
    confirmExitCollaborationIfNeeded.mockResolvedValue(false);
    setModified(true);
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(false);
    expect(showConfirmDialog).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('保存成功 → 放行', async () => {
    setModified(true);
    save.mockResolvedValue({ success: true });
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('保存被拒（needSaveAs）→ 置 saveAsRejectTrigger 弹另存为并中止，不静默', async () => {
    setModified(true);
    save.mockResolvedValue({
      success: false,
      needSaveAs: true,
      message: '请另存为到云图',
    });
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(false);
    expect(saveAsRejectTrigger.value.seq).toBe(1);
    expect(saveAsRejectTrigger.value.reason).toBe('请另存为到云图');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('保存失败（非 needSaveAs）→ toast 原因并中止', async () => {
    setModified(true);
    save.mockResolvedValue({ success: false, message: '保存失败' });
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(false);
    expect(showToast).toHaveBeenCalledWith('保存失败');
    expect(saveAsRejectTrigger.value.seq).toBe(0);
  });

  it('用户选「不保存」→ 丢弃更改并放行', async () => {
    setModified(true);
    // showConfirmDialog reject = 用户选「不保存」
    showConfirmDialog.mockRejectedValueOnce(new Error('cancel'));
    const { guardBeforeOpen } = useOpenGuard();
    await expect(guardBeforeOpen()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
