import { computed } from 'vue';
import { useUIStore } from '@/stores/ui.store';

export const PROGRESS_STAGES = {
  INIT: '正在初始化 CAD 引擎...',
  UPLOAD: '正在上传图纸...',
  PROCESSING: '图纸处理中...',
  OPENING: '正在打开图纸中...',
  SAVING: '正在保存图纸...',
  COMPLETE: '操作完成',
} as const;

export function useProgress() {
  const ui = useUIStore();

  const isActive = computed(() => ui.globalLoading);
  const message = computed(() => ui.loadingMessage);
  const percent = computed(() => ui.loadingProgress);

  function start(msg: string): void {
    ui.setGlobalLoading(true, msg);
  }

  function update(msg: string, pct: number = 0): void {
    ui.loadingMessage = msg;
    ui.loadingProgress = Math.min(100, Math.max(0, pct));
  }

  function finish(): void {
    ui.loadingProgress = 100;
    setTimeout(() => ui.resetLoading(), 300);
  }

  function cancel(): void {
    ui.resetLoading();
  }

  function show(opt: { key: string; msg: string; block?: boolean }): void {
    ui.showLoading(opt.key, opt.msg, opt.block);
  }

  function updateLoading(opt: { key: string; msg: string; pct?: number }): void {
    ui.updateLoading(opt.key, opt.msg, opt.pct);
  }

  function hide(key: string): void {
    ui.hideLoading(key);
  }

  return { isActive, message, percent, start, update, finish, cancel, show, updateLoading, hide };
}