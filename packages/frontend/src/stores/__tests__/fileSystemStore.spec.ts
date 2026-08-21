///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach } from 'vitest';
import { useFileSystemStore } from '../fileSystemStore';

beforeEach(() => {
  localStorage.clear();
  useFileSystemStore.setState({
    personalSpaceId: null,
    personalSpaceIdLoading: false,
    viewMode: 'grid',
    searchTerm: '',
    pageSize: 30,
  });
});

describe('fileSystemStore — Settings', () => {
  it('should set view mode', () => {
    useFileSystemStore.getState().setViewMode('list');
    expect(useFileSystemStore.getState().viewMode).toBe('list');
  });

  it('should set search term', () => {
    useFileSystemStore.getState().setSearchTerm('drawing');
    expect(useFileSystemStore.getState().searchTerm).toBe('drawing');
  });

  it('should set page size', () => {
    useFileSystemStore.getState().setPageSize(50);
    expect(useFileSystemStore.getState().pageSize).toBe(50);
  });
});

describe('fileSystemStore — Personal Space', () => {
  it('should set personal space id', () => {
    useFileSystemStore.getState().setPersonalSpaceId('ps-1');
    expect(useFileSystemStore.getState().personalSpaceId).toBe('ps-1');
  });

  it('should set personal space loading', () => {
    useFileSystemStore.getState().setPersonalSpaceIdLoading(true);
    expect(useFileSystemStore.getState().personalSpaceIdLoading).toBe(true);
  });
});
