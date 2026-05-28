import { showToast as vantShowToast, showLoadingToast as vantShowLoadingToast, closeToast } from 'vant';

let lastMessage = '';
let lastShowTime = 0;
let lastLoadingMessage = '';
let lastLoadingShowTime = 0;
const COOLDOWN_MS = 3000;

export function showToastOnce(message: string, options?: Record<string, any>) {
  const now = Date.now();
  if (message === lastMessage && now - lastShowTime < COOLDOWN_MS) {
    return;
  }
  lastMessage = message;
  lastShowTime = now;
  vantShowToast({
    message,
    duration: 3000,
    ...options,
  });
}

export function showLoadingToastOnce(message: string, options?: Record<string, any>) {
  const now = Date.now();
  if (message === lastLoadingMessage && now - lastLoadingShowTime < COOLDOWN_MS) {
    return;
  }
  lastLoadingMessage = message;
  lastLoadingShowTime = now;
  return vantShowLoadingToast({
    message,
    ...options,
  });
}

export { closeToast };
