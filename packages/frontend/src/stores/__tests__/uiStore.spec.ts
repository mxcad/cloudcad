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
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uiStore — Loading', () => {
  it('should set global loading with default message', () => {
    useUIStore.getState().setGlobalLoading(true);
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(useUIStore.getState().loadingMessage).toBe('');
  });

  it('should set global loading with custom message', () => {
    useUIStore.getState().setGlobalLoading(true, 'loading...');
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(useUIStore.getState().loadingMessage).toBe('loading...');
  });

  it('should set loading message', () => {
    useUIStore.getState().setLoadingMessage('processing');
    expect(useUIStore.getState().loadingMessage).toBe('processing');
  });

  it('should set loading progress', () => {
    useUIStore.getState().setLoadingProgress(50);
    expect(useUIStore.getState().loadingProgress).toBe(50);
  });

  it('should reset loading state', () => {
    useUIStore.getState().setGlobalLoading(true, 'test');
    useUIStore.getState().setLoadingProgress(75);
    useUIStore.getState().resetLoading();
    expect(useUIStore.getState().globalLoading).toBe(false);
    expect(useUIStore.getState().loadingMessage).toBe('');
    expect(useUIStore.getState().loadingProgress).toBe(0);
  });
});
