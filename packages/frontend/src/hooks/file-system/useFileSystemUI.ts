import { useCallback } from 'react';
import { globalShowToast } from '@/utils/notificationEvents';
import type { Toast } from '../../components/ui/Toast';

/**
 * 文件系统 UI 提示 hook。
 *
 * 历史上本 hook 自持 toasts 状态并由各页面（FileSystemManagerView、
 * ProjectDrawingsPanel）自渲染 ToastContainer——与 NotificationProvider 的
 * 全局 ToastStack 都是 fixed 右下角同 z-index，两套容器重叠导致错误提示
 * "关掉一个又露出一个、叉不掉"。现统一委托全局事件总线
 * （globalShowToast → NotificationProvider → 全局 ToastStack），
 * CAD 激活时的消息路由由 NotificationProvider.routeToCadMessage 负责，行为不变。
 */
export const useFileSystemUI = () => {
  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      globalShowToast(message, type);
    },
    []
  );

  return { showToast };
};
