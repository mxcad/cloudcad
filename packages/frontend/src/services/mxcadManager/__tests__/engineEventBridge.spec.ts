import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CAD_EVENTS } from '@/constants/events';
import {
  subscribe,
  emit,
  clearDrawingSessionListeners,
} from '../../drawingSession';
import { bridgeEngineExportFileEvent } from '../engineEventBridge';

describe('engineEventBridge — 引擎 window 导出事件 → 类型化 bus', () => {
  beforeEach(() => {
    clearDrawingSessionListeners();
  });

  it('window mxcad-export-file 事件桥接进 bus，payload 送达订阅者', () => {
    const unbind = bridgeEngineExportFileEvent();
    const handler = vi.fn();

    subscribe(CAD_EVENTS.EXPORT_FILE, handler);
    window.dispatchEvent(
      new CustomEvent(CAD_EVENTS.EXPORT_FILE, {
        detail: { fileId: 'node-1', fileName: 'drawing.dwg' },
      })
    );

    expect(handler).toHaveBeenCalledWith({
      fileId: 'node-1',
      fileName: 'drawing.dwg',
    });
    unbind();
  });

  it('缺少 detail 的事件被忽略，不派发', () => {
    const unbind = bridgeEngineExportFileEvent();
    const handler = vi.fn();
    subscribe(CAD_EVENTS.EXPORT_FILE, handler);

    window.dispatchEvent(new CustomEvent(CAD_EVENTS.EXPORT_FILE));
    expect(handler).not.toHaveBeenCalled();
    unbind();
  });

  it('解除桥接后不再转发 window 事件', () => {
    const unbind = bridgeEngineExportFileEvent();
    const handler = vi.fn();
    subscribe(CAD_EVENTS.EXPORT_FILE, handler);

    unbind();
    window.dispatchEvent(
      new CustomEvent(CAD_EVENTS.EXPORT_FILE, {
        detail: { fileId: 'node-1', fileName: 'a.dwg' },
      })
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('bus 内部 emit 不受桥接影响（仅转发 window 事件）', () => {
    const unbind = bridgeEngineExportFileEvent();
    const handler = vi.fn();
    subscribe(CAD_EVENTS.EXPORT_FILE, handler);

    emit(CAD_EVENTS.EXPORT_FILE, { fileId: 'node-2', fileName: 'b.dwg' });
    expect(handler).toHaveBeenCalledWith({
      fileId: 'node-2',
      fileName: 'b.dwg',
    });
    unbind();
  });
});
