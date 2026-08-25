///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach } from 'vitest';
import { useFileSystemClipboardStore } from '../fileSystemClipboardStore';

beforeEach(() => {
  useFileSystemClipboardStore.setState({
    items: [],
    mode: null,
    sourceProjectId: '',
    sourceParentIds: {},
  });
});

describe('fileSystemClipboardStore', () => {
  it('should have initial empty state', () => {
    const state = useFileSystemClipboardStore.getState();
    expect(state.items).toEqual([]);
    expect(state.mode).toBeNull();
    expect(state.sourceProjectId).toBe('');
    expect(state.sourceParentIds).toEqual({});
  });

  it('should set clipboard with items and mode (copy)', () => {
    useFileSystemClipboardStore
      .getState()
      .setClipboard(['id1', 'id2'], 'copy', 'proj-1');
    const state = useFileSystemClipboardStore.getState();
    expect(state.items).toEqual(['id1', 'id2']);
    expect(state.mode).toBe('copy');
    expect(state.sourceProjectId).toBe('proj-1');
  });

  it('should set clipboard with items and mode (cut)', () => {
    useFileSystemClipboardStore.getState().setClipboard(['id3'], 'cut', 'proj-2', {
      sourceParentIds: { id3: 'parent-1' },
    });
    const state = useFileSystemClipboardStore.getState();
    expect(state.items).toEqual(['id3']);
    expect(state.mode).toBe('cut');
    expect(state.sourceProjectId).toBe('proj-2');
    expect(state.sourceParentIds).toEqual({ id3: 'parent-1' });
  });

  it('should record source root kind and transfer settings snapshot', () => {
    useFileSystemClipboardStore.getState().setClipboard(['id1'], 'copy', 'ps-1', {
      sourceRootKind: 'personal-space',
      sourceTransferSettings: null,
    });
    const state = useFileSystemClipboardStore.getState();
    expect(state.sourceRootKind).toBe('personal-space');
    expect(state.sourceTransferSettings).toBeNull();

    useFileSystemClipboardStore
      .getState()
      .setClipboard(['id2'], 'copy', 'proj-9', {
        sourceRootKind: 'project',
        sourceTransferSettings: { transferOutToProject: 'COPY_ONLY' },
      });
    const next = useFileSystemClipboardStore.getState();
    expect(next.sourceRootKind).toBe('project');
    expect(next.sourceTransferSettings?.transferOutToProject).toBe('COPY_ONLY');
  });

  it('should clear clipboard', () => {
    useFileSystemClipboardStore
      .getState()
      .setClipboard(['id1'], 'copy', 'proj-1');
    useFileSystemClipboardStore.getState().clearClipboard();
    const state = useFileSystemClipboardStore.getState();
    expect(state.items).toEqual([]);
    expect(state.mode).toBeNull();
    expect(state.sourceProjectId).toBe('');
    expect(state.sourceRootKind).toBe('project');
    expect(state.sourceTransferSettings).toBeNull();
  });
});
