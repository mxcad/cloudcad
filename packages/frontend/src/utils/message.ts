import { globalShowToast } from '../contexts/NotificationContext';

let lastMessage = '';
let lastShowTime = 0;
const COOLDOWN_MS = 3000;

function shouldSkip(msg: string): boolean {
  const now = Date.now();
  if (msg === lastMessage && now - lastShowTime < COOLDOWN_MS) {
    return true;
  }
  lastMessage = msg;
  lastShowTime = now;
  return false;
}

function useMxMessage():
  | { info: (msg: string) => void; success: (msg: string) => void; warning: (msg: string) => void; error: (msg: string) => void }
  | null {
  if (window.MxPluginContext?.useMessage) {
    return window.MxPluginContext.useMessage();
  }
  return null;
}

export function infoOnce(msg: string) {
  if (shouldSkip(msg)) return;
  const mx = useMxMessage();
  if (mx) {
    mx.info(msg);
  } else {
    globalShowToast(msg, 'info');
  }
}

export function successOnce(msg: string) {
  if (shouldSkip(msg)) return;
  const mx = useMxMessage();
  if (mx) {
    mx.success(msg);
  } else {
    globalShowToast(msg, 'success');
  }
}

export function warningOnce(msg: string) {
  if (shouldSkip(msg)) return;
  const mx = useMxMessage();
  if (mx) {
    mx.warning(msg);
  } else {
    globalShowToast(msg, 'warning');
  }
}

export function errorOnce(msg: string) {
  if (shouldSkip(msg)) return;
  const mx = useMxMessage();
  if (mx) {
    mx.error(msg);
  } else {
    globalShowToast(msg, 'error');
  }
}
