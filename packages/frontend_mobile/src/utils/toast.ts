import { showToast as vantShowToast, closeToast } from 'vant';

let lastMessage = '';
let lastShowTime = 0;
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

export { closeToast };
