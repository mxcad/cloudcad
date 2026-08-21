///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  nodeControllerCopyNode,
  nodeControllerDeleteNode,
  nodeControllerMoveNode,
} from '@/api-sdk';
import type { UndoableAction } from '@/stores/fileSystemUndoRedoStore';

export interface BuildMoveActionOptions {
  nodeIds: string[];
  targetParentId: string;
  sourceParentIds: Map<string, string>;
  description: string;
  projectId: string | undefined;
}

export function buildMoveAction({
  nodeIds,
  targetParentId,
  sourceParentIds,
  description,
  projectId,
}: BuildMoveActionOptions): UndoableAction {
  return {
    type: 'move',
    description,
    projectId,
    execute: async () => {
      for (const nodeId of nodeIds) {
        await nodeControllerMoveNode({
          path: { nodeId },
          body: { targetParentId },
          throwOnError: true,
        });
      }
    },
    rollback: async () => {
      for (const nodeId of nodeIds) {
        const sourceParentId = sourceParentIds.get(nodeId);
        if (!sourceParentId) continue;
        await nodeControllerMoveNode({
          path: { nodeId },
          body: { targetParentId: sourceParentId },
          throwOnError: true,
        });
      }
    },
  };
}

export interface BuildCopyActionOptions {
  sourceNodeIds: string[];
  targetParentId: string;
  description: string;
  projectId: string | undefined;
  initialCreatedIds?: string[];
}

export function buildCopyAction({
  sourceNodeIds,
  targetParentId,
  description,
  projectId,
  initialCreatedIds = [],
}: BuildCopyActionOptions): UndoableAction {
  const createdIdsRef: { current: string[] } = {
    current: [...initialCreatedIds],
  };
  return {
    type: 'paste-copy',
    description,
    projectId,
    execute: async () => {
      const newIds: string[] = [];
      for (const nodeId of sourceNodeIds) {
        const result = await nodeControllerCopyNode({
          path: { nodeId },
          body: { targetParentId },
          throwOnError: true,
        });
        const newId = getCreatedNodeId(result);
        if (newId) newIds.push(newId);
      }
      createdIdsRef.current = newIds;
    },
    rollback: async () => {
      for (const id of createdIdsRef.current) {
        try {
          await nodeControllerDeleteNode({
            path: { nodeId: id },
            query: { permanently: true },
            throwOnError: true,
          });
        } catch (error) {
          if (isNotFoundError(error)) continue;
          throw error;
        }
      }
    },
  };
}

export function getCreatedNodeId(result: unknown): string {
  const data = (result as { data?: { id?: string } })?.data || result;
  return (data as { id?: string })?.id || '';
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'NOT_FOUND'
  );
}
