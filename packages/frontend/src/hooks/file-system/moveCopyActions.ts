///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { nodeControllerMoveNode } from '@/api-sdk';
import type { UndoableAction } from '@/stores/fileSystemUndoRedoStore';

/**
 * 批量移动/复制操作的结果（前端对后端 BatchOperationResponseDto 的统一视图）：
 * successIds 为源节点 id；createdIds 为复制产出的新副本 id（仅复制返回，与 successIds 一一对应）
 */
export interface OperationOutcome {
  /** 成功处理的源节点 id */
  successIds: string[];
  /** 新建副本 id（仅复制） */
  createdIds: string[];
  /** 失败数量 */
  failedCount: number;
}

/**
 * 复制 undo 动作的端点对：单节点复制（redo 重放）+ 永久删除单节点（rollback）。
 * 调用方按域传入对应端点（项目文件系统=node controller，库=library controller），
 * builder 不绑定具体端点
 */
export interface CopyActionEndpoints {
  copyNode: (nodeId: string, targetParentId: string) => Promise<unknown>;
  deleteNode: (nodeId: string) => Promise<unknown>;
}

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
  /** 初始复制产出的新副本 id（rollback 删除目标；redo 后原地更新为最新副本 id） */
  createdIds: string[];
  description: string;
  projectId: string | undefined;
  endpoints: CopyActionEndpoints;
}

export function buildCopyAction({
  sourceNodeIds,
  targetParentId,
  createdIds: initialCreatedIds,
  description,
  projectId,
  endpoints,
}: BuildCopyActionOptions): UndoableAction {
  // 唯一可变状态：当前副本 id 集合（action.nodeIds 引用同一数组）。
  // redo 重复制后原地更新，rollback 恒删最新副本集合（绝不删源节点），
  // 且 undo/redo 栈清理（removeActions）恒读到最新集合
  const createdIds: string[] = [...initialCreatedIds];
  return {
    type: 'paste-copy',
    description,
    projectId,
    nodeIds: createdIds,
    execute: async () => {
      const newIds: string[] = [];
      for (const nodeId of sourceNodeIds) {
        const result = await endpoints.copyNode(nodeId, targetParentId);
        const newId = getCreatedNodeId(result);
        if (newId) newIds.push(newId);
      }
      createdIds.length = 0;
      createdIds.push(...newIds);
    },
    rollback: async () => {
      for (const id of createdIds) {
        try {
          await endpoints.deleteNode(id);
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
