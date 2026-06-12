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

export function infoOnce(msg: string) {
  if (shouldSkip(msg)) return;
  globalShowToast(msg, 'info');
}

export function successOnce(msg: string) {
  if (shouldSkip(msg)) return;
  globalShowToast(msg, 'success');
}

export function warningOnce(msg: string) {
  if (shouldSkip(msg)) return;
  globalShowToast(msg, 'warning');
}

export function errorOnce(msg: string) {
  if (shouldSkip(msg)) return;
  globalShowToast(msg, 'error');
}
