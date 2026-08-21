///////////////////////////////////////////////////////////////////////////////
// Mx_Insert 命令注册 — 移动端插入图块入口
//
// 调用方式:
//   MxFun.sendStringToExecute("Mx_Insert", {
//     filePath: "/api/v1/library/block/filesData/xxx",
//     name: "blockName",
//     isBlockLibrary: true
//   })
//
// 流程:
//   Mx_Insert 命令 → 保存 params → dispatchEvent "mxcad-show-insert-block"
//     → index.vue 监听到事件 → 设置 showInsertBlock=true + params
//       → <InsertBlockPopup> 渲染
//         → 用户确认 → insertBlock() → 关闭 popup
///////////////////////////////////////////////////////////////////////////////

import { addCommand } from '@/plugins/mxcad/command'
import { currentItem, isBlockLibrary } from '@/composables/useInsertBlock'
import type { BlockInfoItem } from '@/composables/useInsertBlock'

/** 当前传递的插入参数（供 popup 使用） */
export let pendingInsertParams: BlockInfoItem | null = null

function Mx_Insert(params?: BlockInfoItem) {
  if (params) {
    currentItem.value = {
      name: params.name || '',
      filePath: params.filePath,
      id: params.id ?? params.filePath,
      hash: params.hash,
      isBlockLibrary: params.isBlockLibrary,
    }
    isBlockLibrary.value = !!params.isBlockLibrary
  }

  pendingInsertParams = params ?? null

  window.dispatchEvent(
    new CustomEvent('mxcad-show-insert-block', {
      detail: params ?? null,
    })
  )
}

addCommand('Mx_Insert', Mx_Insert)
