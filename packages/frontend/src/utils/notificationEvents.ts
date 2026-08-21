/**
 * 全局通知事件总线（L1 基础设施）
 *
 * 通过 CustomEvent 将「全局提示/确认/输入」请求与 React Provider 解耦，
 * 使 L1 工具（utils/constants 等）无需依赖 L2 Context 即可触发通知。
 * NotificationProvider 订阅这些事件并负责实际渲染与 CAD 消息路由。
 */
import type { ToastType } from '../components/ui/Toast';

export const TOAST_EVENT = 'cloudcad:toast';
export const CONFIRM_EVENT = 'cloudcad:confirm';
export const THREE_BUTTON_CONFIRM_EVENT = 'cloudcad:three-button-confirm';
export const PROMPT_EVENT = 'cloudcad:prompt';
export const CONFIRM_RESPONSE_EVENT = 'cloudcad:confirm-response';
export const THREE_BUTTON_CONFIRM_RESPONSE_EVENT =
  'cloudcad:three-button-confirm-response';
export const PROMPT_RESPONSE_EVENT = 'cloudcad:prompt-response';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export interface ThreeButtonConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  discardText: string;
  cancelText: string;
  dialogType?: 'danger' | 'warning' | 'info';
}

export interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
}

/**
 * 全局 Toast。CAD 路由决策由 NotificationProvider 在收到事件后执行。
 */
export const globalShowToast = (message: string, type: ToastType = 'info') => {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { message, type } })
  );
};

export const globalShowConfirm = (
  options: ConfirmOptions
): Promise<boolean> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ confirmed: boolean }>;
      resolve(customEvent.detail.confirmed);
      window.removeEventListener(
        CONFIRM_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      CONFIRM_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: options }));
  });
};

export const globalShowThreeButtonConfirm = (
  options: ThreeButtonConfirmOptions
): Promise<'confirm' | 'discard' | 'cancel'> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{
        value: 'confirm' | 'discard' | 'cancel';
      }>;
      resolve(customEvent.detail.value);
      window.removeEventListener(
        THREE_BUTTON_CONFIRM_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      THREE_BUTTON_CONFIRM_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(
      new CustomEvent(THREE_BUTTON_CONFIRM_EVENT, { detail: options })
    );
  });
};

export const globalShowPrompt = (
  options: PromptOptions
): Promise<string | null> => {
  return new Promise((resolve) => {
    const handleResponse = (e: Event) => {
      const customEvent = e as CustomEvent<{ value: string | null }>;
      resolve(customEvent.detail.value);
      window.removeEventListener(
        PROMPT_RESPONSE_EVENT,
        handleResponse as EventListener
      );
    };
    window.addEventListener(
      PROMPT_RESPONSE_EVENT,
      handleResponse as EventListener
    );
    window.dispatchEvent(new CustomEvent(PROMPT_EVENT, { detail: options }));
  });
};
