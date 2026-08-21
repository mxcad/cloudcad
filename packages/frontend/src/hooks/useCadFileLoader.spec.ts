import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useCadFileLoader,
  type CadFileLoaderState,
  type CadFileLoaderCallbacks,
} from './useCadFileLoader';
import {
  emit,
  subscribe,
  clearDrawingSessionListeners,
} from '@/services/drawingSession';
import { CAD_EVENTS } from '@/constants/events';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

function createDeps(): CadFileLoaderState {
  return {
    fileId: null,
    collabWorkId: null,
    isAuthenticated: false,
    personalSpaceId: null,
    libraryKeyParam: null,
    shareTokenParam: null,
    versionParam: null,
    nodeIdParam: null,
    shareFileNameParam: null,
    hasLibraryDrawingManage: false,
    hasLibraryBlockManage: false,
    isInitializedRef: { current: false },
    loadedFileUrlRef: { current: null },
    currentFileIdRef: { current: null },
    isActive: false,
  };
}

function createFns(): CadFileLoaderCallbacks {
  return {
    onError: vi.fn(),
    onStoreError: vi.fn(),
    onLoading: vi.fn(),
    onStoreLoading: vi.fn(),
    setStoreFileId: vi.fn(),
    setStoreFileName: vi.fn(),
    setFromShare: vi.fn(),
    setStoreProjectId: vi.fn(),
    onNewFile: vi.fn(),
  };
}

describe('useCadFileLoader — NEW_FILE 走类型化 bus（T8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearDrawingSessionListeners();
  });

  it('bus emit NEW_FILE 触发 onNewFile 回调', () => {
    const fns = createFns();
    renderHook(() => useCadFileLoader(createDeps(), fns));

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: null,
        parentId: null,
        projectId: null,
      });
    });

    expect(fns.onNewFile).toHaveBeenCalledTimes(1);
  });

  it('bus payload 完整透传（fileId/parentId/projectId 字段保持）', () => {
    const received: unknown[] = [];
    const unsubscribe = subscribe(CAD_EVENTS.NEW_FILE, (detail) => {
      received.push(detail);
    });
    const fns = createFns();
    renderHook(() => useCadFileLoader(createDeps(), fns));

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: 'f-1',
        parentId: 'p-1',
        projectId: 'prj-1',
      });
    });

    expect(received).toEqual([
      { fileId: 'f-1', parentId: 'p-1', projectId: 'prj-1' },
    ]);
    expect(fns.onNewFile).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('unmount 后取消订阅，emit 不再触发 onNewFile', () => {
    const fns = createFns();
    const { unmount } = renderHook(() => useCadFileLoader(createDeps(), fns));
    unmount();

    act(() => {
      emit(CAD_EVENTS.NEW_FILE, {
        fileId: null,
        parentId: null,
        projectId: null,
      });
    });

    expect(fns.onNewFile).not.toHaveBeenCalled();
  });
});
