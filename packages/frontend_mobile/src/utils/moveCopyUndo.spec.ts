/**
 * extractMoveCopyUndoIds：移动/复制撤销目标 id 提取（纯函数）。
 *
 * 回归点（部分成功 failedCount>0 场景，对齐 PC useMoveCopyOrchestrator）：
 * - 仅回滚「实际发生变化的项」：move=successIds、copy=createdIds；
 * - 部分成功 → 只含成功项（失败项未变化，不回滚）；
 * - 全失败 → 空数组（调用方据此不展示撤销条）；
 * - 单条 vs 批量响应形状不同（单条=节点对象 id，批量=successIds/createdIds）。
 */
import { describe, it, expect } from 'vitest'
import { extractMoveCopyUndoIds } from './moveCopyUndo'
import type { BatchOperationResponseDto } from '@cloudcad/api-sdk/types.gen'

function batch(partial: Partial<BatchOperationResponseDto>): BatchOperationResponseDto {
  return {
    successCount: 0,
    failedCount: 0,
    successIds: [],
    failedIds: [],
    ...partial,
  }
}

describe('extractMoveCopyUndoIds', () => {
  describe('copy', () => {
    it('单条复制 → 新副本 id', () => {
      expect(
        extractMoveCopyUndoIds({ op: 'copy', isSingle: true, singleResultId: 'new-1', originalIds: ['src-1'] }),
      ).toEqual(['new-1'])
    })

    it('单条复制无结果 id → 空（不展示撤销条）', () => {
      expect(
        extractMoveCopyUndoIds({ op: 'copy', isSingle: true, singleResultId: undefined, originalIds: ['src-1'] }),
      ).toEqual([])
    })

    it('批量复制全部成功 → createdIds', () => {
      const data = batch({ successCount: 2, successIds: ['a', 'b'], createdIds: ['c1', 'c2'] })
      expect(
        extractMoveCopyUndoIds({ op: 'copy', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual(['c1', 'c2'])
    })

    it('批量复制部分成功 → 仅成功副本（失败项无副本，不回滚）', () => {
      const data = batch({
        successCount: 1,
        failedCount: 1,
        successIds: ['a'],
        failedIds: ['b'],
        createdIds: ['c1'],
      })
      expect(
        extractMoveCopyUndoIds({ op: 'copy', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual(['c1'])
    })

    it('批量复制全失败 → 空（createdIds 为空）', () => {
      const data = batch({ successCount: 0, failedCount: 2, successIds: [], failedIds: ['a', 'b'], createdIds: [] })
      expect(
        extractMoveCopyUndoIds({ op: 'copy', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual([])
    })
  })

  describe('move', () => {
    it('单条移动 → 原节点 id', () => {
      expect(
        extractMoveCopyUndoIds({ op: 'move', isSingle: true, singleResultId: 'src-1', originalIds: ['src-1'] }),
      ).toEqual(['src-1'])
    })

    it('批量移动全部成功 → successIds', () => {
      const data = batch({ successCount: 2, successIds: ['a', 'b'], failedIds: [] })
      expect(
        extractMoveCopyUndoIds({ op: 'move', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual(['a', 'b'])
    })

    it('批量移动部分成功 → 仅成功项（失败项未移动，不回滚）', () => {
      const data = batch({ successCount: 1, failedCount: 1, successIds: ['a'], failedIds: ['b'] })
      expect(
        extractMoveCopyUndoIds({ op: 'move', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual(['a'])
    })

    it('批量移动全失败 → 空（successIds 为空）', () => {
      const data = batch({ successCount: 0, failedCount: 2, successIds: [], failedIds: ['a', 'b'] })
      expect(
        extractMoveCopyUndoIds({ op: 'move', isSingle: false, batchData: data, originalIds: ['a', 'b'] }),
      ).toEqual([])
    })
  })
})
