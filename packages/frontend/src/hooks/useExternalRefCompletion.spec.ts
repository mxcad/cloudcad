import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExternalRefCompletion } from './useExternalRefCompletion';
import {
  emit,
  subscribe,
  clearDrawingSessionListeners,
} from '@/services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';
import type { UseExternalReferenceUploadReturn } from '@/types/filesystem';

function createUpload(
  checkMissingReferences: ReturnType<typeof vi.fn>
): UseExternalReferenceUploadReturn {
  return {
    isOpen: false,
    files: [],
    loading: false,
    checkMissingReferences,
    selectFiles: vi.fn(),
    uploadFiles: vi.fn(),
    close: vi.fn(),
    complete: vi.fn(),
  };
}

describe('useExternalRefCompletion — PUBLIC_FILE_UPLOADED 走类型化 bus（T8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('noCache=false：直接执行 callback（bus payload 原样送达 handler）', async () => {
    const checkMock = vi.fn().mockResolvedValue(false);
    const callback = vi.fn().mockResolvedValue(undefined);
    const onCallbackRefChange = vi.fn();
    const onFileHashChange = vi.fn();

    renderHook(() =>
      useExternalRefCompletion(createUpload(checkMock), onCallbackRefChange, onFileHashChange)
    );

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-1',
        fileName: 'demo.dwg',
        noCache: false,
        callback,
      });
    });

    expect(onFileHashChange).toHaveBeenCalledWith('hash-1');
    expect(onCallbackRefChange).toHaveBeenCalledWith(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('noCache=true 且无缺失参照：checkMissingReferences 后执行 callback', async () => {
    const checkMock = vi.fn().mockResolvedValue(false);
    const callback = vi.fn().mockResolvedValue(undefined);
    const onCallbackRefChange = vi.fn();

    renderHook(() =>
      useExternalRefCompletion(createUpload(checkMock), onCallbackRefChange)
    );

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-2',
        fileName: 'demo.dwg',
        noCache: true,
        callback,
      });
    });

    expect(checkMock).toHaveBeenCalledWith('hash-2', true, false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('noCache=true 且存在缺失参照：不执行 callback', async () => {
    const checkMock = vi.fn().mockResolvedValue(true);
    const callback = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useExternalRefCompletion(createUpload(checkMock), vi.fn())
    );

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-3',
        fileName: 'demo.dwg',
        noCache: true,
        callback,
      });
    });

    expect(checkMock).toHaveBeenCalledWith('hash-3', true, false);
    expect(callback).not.toHaveBeenCalled();
  });

  it('checkMissingReferences 抛错时仍执行 callback', async () => {
    const checkMock = vi.fn().mockRejectedValue(new Error('check failed'));
    const callback = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useExternalRefCompletion(createUpload(checkMock), vi.fn())
    );

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-4',
        fileName: 'demo.dwg',
        noCache: true,
        callback,
      });
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('unmount 后取消订阅，emit 不再触发 handler', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const onCallbackRefChange = vi.fn();

    const { unmount } = renderHook(() =>
      useExternalRefCompletion(createUpload(vi.fn()), onCallbackRefChange)
    );
    unmount();

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-5',
        fileName: 'demo.dwg',
        noCache: false,
        callback,
      });
    });

    expect(onCallbackRefChange).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('订阅点收到 emit 的原始 payload（bus 契约：字段完整透传）', async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribe(CAD_EVENTS.PUBLIC_FILE_UPLOADED, (detail) => {
      received.push(detail);
    });
    const callback = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useExternalRefCompletion(createUpload(vi.fn()), vi.fn()));

    await act(async () => {
      emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
        fileHash: 'hash-6',
        fileName: 'xref.dwg',
        noCache: true,
        callback,
      });
    });

    expect(received).toEqual([
      {
        fileHash: 'hash-6',
        fileName: 'xref.dwg',
        noCache: true,
        callback,
      },
    ]);
    unsubscribe();
  });
});
