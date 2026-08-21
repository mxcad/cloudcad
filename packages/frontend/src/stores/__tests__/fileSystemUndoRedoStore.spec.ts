///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFileSystemUndoRedoStore } from '../fileSystemUndoRedoStore';
import type { UndoableAction } from '../fileSystemUndoRedoStore';

function createMockAction(overrides: Partial<UndoableAction> = {}): UndoableAction {
  return {
    type: 'rename',
    description: 'test action',
    projectId: 'proj-1',
    execute: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  useFileSystemUndoRedoStore.setState({
    undoStack: [],
    redoStack: [],
    isProcessing: false,
  });
});

describe('fileSystemUndoRedoStore — pushAction', () => {
  it('should push action to undo stack and clear redo stack', () => {
    const a1 = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(a1);
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(1);
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });

  it('should clear redo stack on new action', () => {
    const a1 = createMockAction({ type: 'delete' });
    const a2 = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(a1);
    useFileSystemUndoRedoStore.setState({ redoStack: [a2] });
    useFileSystemUndoRedoStore.getState().pushAction(a1);
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });
});

describe('fileSystemUndoRedoStore — undo', () => {
  it('should rollback the last action and move it to redo stack', async () => {
    const action = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(action);
    await useFileSystemUndoRedoStore.getState().undo('proj-1');
    expect(action.rollback).toHaveBeenCalledOnce();
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(0);
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(1);
  });

  it('should do nothing when undo stack is empty', async () => {
    await useFileSystemUndoRedoStore.getState().undo('proj-1');
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(0);
  });

  it('should throw when project id mismatches', async () => {
    const action = createMockAction({ projectId: 'proj-1' });
    useFileSystemUndoRedoStore.getState().pushAction(action);
    await expect(
      useFileSystemUndoRedoStore.getState().undo('proj-2')
    ).rejects.toThrow();
  });

  it('should skip when isProcessing is true', async () => {
    const action = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(action);
    useFileSystemUndoRedoStore.setState({ isProcessing: true });
    await useFileSystemUndoRedoStore.getState().undo('proj-1');
    expect(action.rollback).not.toHaveBeenCalled();
  });
});

describe('fileSystemUndoRedoStore — redo', () => {
  it('should execute the last redo action and move it to undo stack', async () => {
    const action = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(action);
    await useFileSystemUndoRedoStore.getState().undo('proj-1');
    await useFileSystemUndoRedoStore.getState().redo('proj-1');
    expect(action.execute).toHaveBeenCalledOnce();
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(1);
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });

  it('should do nothing when redo stack is empty', async () => {
    await useFileSystemUndoRedoStore.getState().redo('proj-1');
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });
});

describe('fileSystemUndoRedoStore — clearStack', () => {
  it('should clear both stacks', () => {
    const a = createMockAction();
    useFileSystemUndoRedoStore.getState().pushAction(a);
    useFileSystemUndoRedoStore.setState({ redoStack: [a] });
    useFileSystemUndoRedoStore.getState().clearStack();
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(0);
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });
});

describe('fileSystemUndoRedoStore — removeActions', () => {
  it('should remove matching actions from both stacks', () => {
    const del = createMockAction({ type: 'delete', description: 'del' });
    const mv = createMockAction({ type: 'move', description: 'mv' });
    useFileSystemUndoRedoStore.getState().pushAction(del);
    useFileSystemUndoRedoStore.getState().pushAction(mv);
    useFileSystemUndoRedoStore.setState({ redoStack: [del] });
    useFileSystemUndoRedoStore
      .getState()
      .removeActions((a) => a.type === 'delete');
    expect(useFileSystemUndoRedoStore.getState().undoStack).toHaveLength(1);
    expect(useFileSystemUndoRedoStore.getState().undoStack[0].type).toBe('move');
    expect(useFileSystemUndoRedoStore.getState().redoStack).toHaveLength(0);
  });
});
