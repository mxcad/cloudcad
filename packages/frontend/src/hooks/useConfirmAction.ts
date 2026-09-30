import { useCallback } from 'react';
import { useConfirmDialog } from '@/contexts/NotificationContext';

/**
 * 回调式确认弹窗（useConfirmDialog 的 Promise API → callback 适配，唯一出口）。
 *
 * 供内核 hooks 消费「确认后执行」形态：取消时静默不执行 onConfirm。
 * 需要等待用户选择再分支的调用方直接用 useConfirmDialog 的 Promise API。
 */
export function useConfirmAction() {
  const { showConfirm } = useConfirmDialog();
  return useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      type?: 'danger' | 'warning' | 'info',
      confirmText?: string
    ) => {
      showConfirm({ title, message, type, confirmText }).then((confirmed) => {
        if (confirmed) {
          onConfirm();
        }
      });
    },
    [showConfirm]
  );
}
