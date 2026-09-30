///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUIStore } from '../uiStore';

beforeEach(() => {
  vi.useFakeTimers();
  useUIStore.setState({
    globalLoading: false,
    loadingMessage: '',
    loadingProgress: 0,
    loadingRefCount: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uiStore — Loading（引用计数模型）', () => {
  it('showGlobalLoading 进入 loading，默认消息为空', () => {
    useUIStore.getState().showGlobalLoading();
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(useUIStore.getState().loadingRefCount).toBe(1);
    expect(useUIStore.getState().loadingMessage).toBe('');
  });

  it('showGlobalLoading 携带自定义消息', () => {
    useUIStore.getState().showGlobalLoading('loading...');
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(useUIStore.getState().loadingMessage).toBe('loading...');
  });

  it('嵌套 show/hide：最后一个 hide 才真正隐藏（核心不变式）', () => {
    const { showGlobalLoading, hideGlobalLoading } = useUIStore.getState();
    showGlobalLoading('外层');
    showGlobalLoading('内层');
    expect(useUIStore.getState().loadingRefCount).toBe(2);
    hideGlobalLoading();
    // 还有一层引用，loading 保持
    expect(useUIStore.getState().globalLoading).toBe(true);
    hideGlobalLoading();
    expect(useUIStore.getState().globalLoading).toBe(false);
    expect(useUIStore.getState().loadingRefCount).toBe(0);
    expect(useUIStore.getState().loadingProgress).toBe(0);
  });

  it('refCount 为 0 时 hide 是无害 no-op（幂等）', () => {
    useUIStore.getState().hideGlobalLoading();
    expect(useUIStore.getState().globalLoading).toBe(false);
    expect(useUIStore.getState().loadingRefCount).toBe(0);
  });

  it('should set loading message', () => {
    useUIStore.getState().setLoadingMessage('processing');
    expect(useUIStore.getState().loadingMessage).toBe('processing');
  });

  it('should set loading progress', () => {
    useUIStore.getState().setLoadingProgress(50);
    expect(useUIStore.getState().loadingProgress).toBe(50);
  });

  it('resetLoading 强制清零（含引用计数）', () => {
    useUIStore.getState().showGlobalLoading('test');
    useUIStore.getState().showGlobalLoading();
    useUIStore.getState().setLoadingProgress(75);
    useUIStore.getState().resetLoading();
    expect(useUIStore.getState().globalLoading).toBe(false);
    expect(useUIStore.getState().loadingRefCount).toBe(0);
    expect(useUIStore.getState().loadingMessage).toBe('');
    expect(useUIStore.getState().loadingProgress).toBe(0);
  });
});
