///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, beforeEach } from 'vitest';
import { useCADEditorStore } from '../useCADEditorStore';

beforeEach(() => {
  useCADEditorStore.setState({
    isActive: false,
    loading: false,
    error: null,
    canSave: false,
    canExport: false,
    canManageExternalRef: false,
    currentFileId: null,
    currentFileName: null,
    currentProjectId: null,
    isPersonalSpaceMode: false,
    fromShare: false,
    fromCollabShare: false,
    targetCollabWorkId: null,
    collabShareLibraryKey: null,
    isInCollaboration: false,
    collaborationWorkId: null,
    currentFileInfo: null,
  });
});

describe('useCADEditorStore — Basic setters', () => {
  it('should set isActive', () => {
    useCADEditorStore.getState().setIsActive(true);
    expect(useCADEditorStore.getState().isActive).toBe(true);
  });

  it('should set loading', () => {
    useCADEditorStore.getState().setLoading(true);
    expect(useCADEditorStore.getState().loading).toBe(true);
  });

  it('should set error', () => {
    useCADEditorStore.getState().setError('something went wrong');
    expect(useCADEditorStore.getState().error).toBe('something went wrong');
  });

  it('should clear error with null', () => {
    useCADEditorStore.getState().setError('err');
    useCADEditorStore.getState().setError(null);
    expect(useCADEditorStore.getState().error).toBeNull();
  });

  it('should set currentFileId', () => {
    useCADEditorStore.getState().setCurrentFileId('file-1');
    expect(useCADEditorStore.getState().currentFileId).toBe('file-1');
  });

  it('should set currentFileName', () => {
    useCADEditorStore.getState().setCurrentFileName('drawing.dwg');
    expect(useCADEditorStore.getState().currentFileName).toBe('drawing.dwg');
  });

  it('should set currentProjectId', () => {
    useCADEditorStore.getState().setCurrentProjectId('proj-1');
    expect(useCADEditorStore.getState().currentProjectId).toBe('proj-1');
  });

  it('should set isPersonalSpaceMode', () => {
    useCADEditorStore.getState().setIsPersonalSpaceMode(true);
    expect(useCADEditorStore.getState().isPersonalSpaceMode).toBe(true);
  });

  it('should set fromShare', () => {
    useCADEditorStore.getState().setFromShare(true);
    expect(useCADEditorStore.getState().fromShare).toBe(true);
  });
});

describe('useCADEditorStore — Permissions', () => {
  it('should set permissions with partial updates', () => {
    useCADEditorStore.getState().setPermissions({ canSave: true });
    expect(useCADEditorStore.getState().canSave).toBe(true);
    expect(useCADEditorStore.getState().canExport).toBe(false);
    useCADEditorStore.getState().setPermissions({ canExport: true, canManageExternalRef: true });
    expect(useCADEditorStore.getState().canSave).toBe(true);
    expect(useCADEditorStore.getState().canExport).toBe(true);
    expect(useCADEditorStore.getState().canManageExternalRef).toBe(true);
  });
});

describe('useCADEditorStore — Collaboration state', () => {
  it('should set collaboration state', () => {
    useCADEditorStore
      .getState()
      .setCollaborationState({ isInCollaboration: true, workId: 42 });
    expect(useCADEditorStore.getState().isInCollaboration).toBe(true);
    expect(useCADEditorStore.getState().collaborationWorkId).toBe(42);
  });

  it('should reset collaboration state', () => {
    useCADEditorStore
      .getState()
      .setCollaborationState({ isInCollaboration: false, workId: null });
    expect(useCADEditorStore.getState().isInCollaboration).toBe(false);
    expect(useCADEditorStore.getState().collaborationWorkId).toBeNull();
  });
});

describe('useCADEditorStore — Collab share state', () => {
  it('should set collab share state with libraryKey', () => {
    useCADEditorStore
      .getState()
      .setCollabShareState({
        fromCollabShare: true,
        targetWorkId: 7,
        libraryKey: 'block',
      });
    expect(useCADEditorStore.getState().fromCollabShare).toBe(true);
    expect(useCADEditorStore.getState().targetCollabWorkId).toBe(7);
    expect(useCADEditorStore.getState().collabShareLibraryKey).toBe('block');
  });

  it('should default libraryKey to null when not provided', () => {
    useCADEditorStore
      .getState()
      .setCollabShareState({
        fromCollabShare: true,
        targetWorkId: 7,
      });
    expect(useCADEditorStore.getState().collabShareLibraryKey).toBeNull();
  });
});

describe('useCADEditorStore — currentFileInfo', () => {
  const mockInfo = {
    id: 'file-1',
    name: 'drawing.dwg',
    projectId: 'proj-1',
  } as any;

  it('should set current file info', () => {
    useCADEditorStore.getState().setCurrentFileInfo(mockInfo);
    expect(useCADEditorStore.getState().currentFileInfo).toEqual(mockInfo);
  });

  it('should clear current file info with null', () => {
    useCADEditorStore.getState().setCurrentFileInfo(mockInfo);
    useCADEditorStore.getState().setCurrentFileInfo(null);
    expect(useCADEditorStore.getState().currentFileInfo).toBeNull();
  });

  it('should patch current file info', () => {
    useCADEditorStore.getState().setCurrentFileInfo(mockInfo);
    useCADEditorStore.getState().patchCurrentFileInfo({ name: 'renamed.dwg' });
    expect(useCADEditorStore.getState().currentFileInfo?.name).toBe('renamed.dwg');
    expect(useCADEditorStore.getState().currentFileInfo?.id).toBe('file-1');
  });

  it('should do nothing when patching with null currentFileInfo', () => {
    useCADEditorStore.getState().patchCurrentFileInfo({ name: 'x.dwg' });
    expect(useCADEditorStore.getState().currentFileInfo).toBeNull();
  });
});
