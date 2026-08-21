///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api-sdk', () => ({
  nodeControllerMoveNode: vi.fn(),
  nodeControllerCopyNode: vi.fn(),
  nodeControllerDeleteNode: vi.fn(),
}));

import {
  buildMoveAction,
  buildCopyAction,
  getCreatedNodeId,
} from './moveCopyActions';
import {
  nodeControllerMoveNode,
  nodeControllerCopyNode,
  nodeControllerDeleteNode,
} from '@/api-sdk';

const moveMock = nodeControllerMoveNode as unknown as ReturnType<typeof vi.fn>;
const copyMock = nodeControllerCopyNode as unknown as ReturnType<typeof vi.fn>;
const deleteMock =
  nodeControllerDeleteNode as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  moveMock.mockResolvedValue(undefined);
  copyMock.mockResolvedValue({ data: { id: 'created-1' } });
  deleteMock.mockResolvedValue(undefined);
});

describe('getCreatedNodeId', () => {
  it('returns id from flat { id } shape', () => {
    expect(getCreatedNodeId({ id: 'node-1' })).toBe('node-1');
  });

  it('returns id from wrapped { data: { id } } shape', () => {
    expect(getCreatedNodeId({ data: { id: 'node-2' } })).toBe('node-2');
  });

  it('returns empty string when id is missing', () => {
    expect(getCreatedNodeId({})).toBe('');
    expect(getCreatedNodeId({ data: {} })).toBe('');
    expect(getCreatedNodeId(undefined)).toBe('');
  });
});

describe('buildMoveAction', () => {
  const options = {
    nodeIds: ['a', 'b', 'c'],
    targetParentId: 'target-1',
    sourceParentIds: new Map([
      ['a', 'src-a'],
      ['b', 'src-b'],
    ]),
    description: '移动 3 个项目',
    projectId: 'proj-1',
  };

  it('creates a move action with metadata', () => {
    const action = buildMoveAction(options);
    expect(action.type).toBe('move');
    expect(action.description).toBe('移动 3 个项目');
    expect(action.projectId).toBe('proj-1');
  });

  it('execute moves every node to the target parent', async () => {
    const action = buildMoveAction(options);
    await action.execute();
    expect(moveMock).toHaveBeenCalledTimes(3);
    for (const nodeId of ['a', 'b', 'c']) {
      expect(moveMock).toHaveBeenCalledWith({
        path: { nodeId },
        body: { targetParentId: 'target-1' },
        throwOnError: true,
      });
    }
  });

  it('rollback moves nodes back to their recorded source parents', async () => {
    const action = buildMoveAction(options);
    await action.rollback();
    expect(moveMock).toHaveBeenCalledTimes(2);
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      body: { targetParentId: 'src-a' },
      throwOnError: true,
    });
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'b' },
      body: { targetParentId: 'src-b' },
      throwOnError: true,
    });
  });

  it('rollback skips nodes without a source parent', async () => {
    const action = buildMoveAction({
      ...options,
      sourceParentIds: new Map([['a', '']]),
    });
    await action.rollback();
    expect(moveMock).toHaveBeenCalledTimes(0);
  });

  it('rollback only touches nodes included in nodeIds', async () => {
    const action = buildMoveAction({
      ...options,
      nodeIds: ['a'],
      sourceParentIds: new Map([
        ['a', 'src-a'],
        ['stale', 'src-stale'],
      ]),
    });
    await action.rollback();
    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(moveMock).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      body: { targetParentId: 'src-a' },
      throwOnError: true,
    });
  });
});

describe('buildCopyAction', () => {
  const options = {
    sourceNodeIds: ['a', 'b'],
    targetParentId: 'target-1',
    description: '复制 2 个项目',
    projectId: 'proj-1',
  };

  it('creates a paste-copy action with metadata', () => {
    const action = buildCopyAction(options);
    expect(action.type).toBe('paste-copy');
    expect(action.description).toBe('复制 2 个项目');
    expect(action.projectId).toBe('proj-1');
  });

  it('rollback deletes the initial created ids when undo happens without redo', async () => {
    const action = buildCopyAction({
      ...options,
      initialCreatedIds: ['created-a', 'created-b'],
    });
    await action.rollback();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    for (const id of ['created-a', 'created-b']) {
      expect(deleteMock).toHaveBeenCalledWith({
        path: { nodeId: id },
        query: { permanently: true },
        throwOnError: true,
      });
    }
  });

  it('execute replays copies and updates the rollback set to redo products', async () => {
    copyMock.mockResolvedValueOnce({ data: { id: 'redo-a' } });
    copyMock.mockResolvedValueOnce({ id: 'redo-b' });
    const action = buildCopyAction({
      ...options,
      initialCreatedIds: ['created-a'],
    });
    await action.execute();
    expect(copyMock).toHaveBeenCalledTimes(2);
    expect(copyMock).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      body: { targetParentId: 'target-1' },
      throwOnError: true,
    });
    expect(copyMock).toHaveBeenCalledWith({
      path: { nodeId: 'b' },
      body: { targetParentId: 'target-1' },
      throwOnError: true,
    });

    await action.rollback();
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith({
      path: { nodeId: 'redo-a' },
      query: { permanently: true },
      throwOnError: true,
    });
    expect(deleteMock).toHaveBeenCalledWith({
      path: { nodeId: 'redo-b' },
      query: { permanently: true },
      throwOnError: true,
    });
  });

  it('execute skips results without a created id', async () => {
    copyMock.mockResolvedValueOnce({ data: {} });
    copyMock.mockResolvedValueOnce({ data: { id: 'redo-a' } });
    const action = buildCopyAction(options);
    await action.execute();
    await action.rollback();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith({
      path: { nodeId: 'redo-a' },
      query: { permanently: true },
      throwOnError: true,
    });
  });

  it('rollback skips NOT_FOUND errors and continues', async () => {
    const notFound = Object.assign(new Error('not found'), {
      code: 'NOT_FOUND',
    });
    deleteMock.mockRejectedValueOnce(notFound);
    deleteMock.mockResolvedValueOnce(undefined);
    const action = buildCopyAction({
      ...options,
      initialCreatedIds: ['created-a', 'created-b'],
    });
    await expect(action.rollback()).resolves.toBeUndefined();
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  it('rollback rethrows errors that are not NOT_FOUND', async () => {
    const serverError = new Error('server error');
    deleteMock.mockRejectedValueOnce(serverError);
    const action = buildCopyAction({
      ...options,
      initialCreatedIds: ['created-a'],
    });
    await expect(action.rollback()).rejects.toThrow('server error');
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
