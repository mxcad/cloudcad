///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHomeInit } from './useHomeInit';
import { VIEW_INIT_TIMEOUT_MS } from '../services/mxcadManager/mxcadTypes';
import {
  mxcadManager,
  initMxCADConfig,
  initThemeSync,
} from '../services/mxcadManager';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('../services/mxcadManager', () => ({
  mxcadManager: {
    isCreated: vi.fn(),
    initializeMxCADView: vi.fn(),
    showMxCAD: vi.fn(),
  },
  initMxCADConfig: vi.fn(),
  initThemeSync: vi.fn(),
  setNavigateFunction: vi.fn(),
}));

const mockIsCreated = vi.mocked(mxcadManager.isCreated);
const mockInitializeMxCADView = vi.mocked(mxcadManager.initializeMxCADView);
const mockShowMxCAD = vi.mocked(mxcadManager.showMxCAD);
const mockInitMxCADConfig = vi.mocked(initMxCADConfig);
const mockInitThemeSync = vi.mocked(initThemeSync);

const buildOptions = () => ({
  isHomeMode: true,
  isCollabLink: false,
  isActive: true,
  isInitializedRef: { current: false },
  onSetError: vi.fn(),
  onSetStoreError: vi.fn(),
  onSetLoading: vi.fn(),
  onSetStoreLoading: vi.fn(),
});

// 超时看门狗走 setTimeout，RAF 保持真实避免与 fake timer 相互等待
const enableFakeTimers = () =>
  vi.useFakeTimers({
    doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCreated.mockReturnValue(false);
  mockInitMxCADConfig.mockResolvedValue(undefined);
  mockInitThemeSync.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useHomeInit 初始化看门狗', () => {
  it('引擎初始化悬挂时：超时转错误态并关闭骨架屏，而非永久 loading', async () => {
    enableFakeTimers();
    // WASM 加载 / token 刷新悬挂：永不 settle
    mockInitializeMxCADView.mockReturnValue(new Promise<void>(() => {}));

    const options = buildOptions();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      renderHook(() => useHomeInit(options));
    });

    // 超时前仍处于 loading，未关闭骨架屏
    expect(options.onSetLoading).not.toHaveBeenCalledWith(false);

    await act(async () => {
      vi.advanceTimersByTime(VIEW_INIT_TIMEOUT_MS);
    });

    expect(options.onSetLoading).toHaveBeenCalledWith(false);
    expect(options.onSetStoreLoading).toHaveBeenCalledWith(false);
    expect(options.onSetError).toHaveBeenCalledWith(expect.any(String));
    expect(options.onSetStoreError).toHaveBeenCalledWith(expect.any(String));

    // 原始异常对象被记录：此前空 catch 静默吞掉，悬挂时无日志可查
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('初始化失败'),
      expect.any(Error)
    );
  });

  it('引擎已创建时：直接显示并关闭 loading，不重复初始化', async () => {
    mockIsCreated.mockReturnValue(true);

    const options = buildOptions();
    await act(async () => {
      renderHook(() => useHomeInit(options));
    });

    expect(mockShowMxCAD).toHaveBeenCalledWith(true);
    expect(options.onSetLoading).toHaveBeenCalledWith(false);
    expect(options.isInitializedRef.current).toBe(true);
    expect(mockInitializeMxCADView).not.toHaveBeenCalled();
  });

  it('初始化抛错时：记录原始错误并进入错误态', async () => {
    enableFakeTimers();
    const failure = new Error('WASM 加载失败');
    mockInitMxCADConfig.mockRejectedValue(failure);

    const options = buildOptions();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      renderHook(() => useHomeInit(options));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.onSetLoading).toHaveBeenCalledWith(false);
    expect(options.onSetError).toHaveBeenCalledWith(expect.any(String));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('初始化失败'),
      failure
    );
  });
});
