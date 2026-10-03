/**
 * 移动/复制撤销目标 id 提取（纯函数，便于单测）。
 *
 * 仅回滚「实际发生变化的项」，对齐 PC useMoveCopyOrchestrator 语义：
 *   - move → 成功移动的节点（批量 successIds / 单条原节点 id）
 *   - copy → 成功创建的副本（批量 createdIds / 单条新节点 id）
 *
 * 部分成功（failedCount>0）时只回滚成功项——失败项本就未变化、无需回滚；
 * 全失败时返回空数组，调用方据此不展示撤销条。
 *
 * 单条 vs 批量响应形状不同：单条 move/copy 返回节点对象（FileSystemNodeDto），
 * 批量返回 BatchOperationResponseDto（successIds/createdIds）。
 */
import type { BatchOperationResponseDto } from '@cloudcad/api-sdk/types.gen'

export interface MoveCopyUndoInput {
  op: 'move' | 'copy'
  /** 是否单条操作（items.length === 1） */
  isSingle: boolean
  /** 单条操作响应里的节点 id：copy=新副本 id，move=原节点 id（与 originalIds[0] 相同） */
  singleResultId?: string
  /** 批量操作响应数据（含 successIds/createdIds） */
  batchData?: BatchOperationResponseDto | null
  /** 原始项 id 列表（单条 move 回滚用，取首项） */
  originalIds: string[]
}

export function extractMoveCopyUndoIds(input: MoveCopyUndoInput): string[] {
  if (input.op === 'copy') {
    return input.isSingle
      ? (input.singleResultId ? [input.singleResultId] : [])
      : (input.batchData?.createdIds ?? [])
  }
  // move
  return input.isSingle
    ? input.originalIds.slice(0, 1)
    : (input.batchData?.successIds ?? [])
}
