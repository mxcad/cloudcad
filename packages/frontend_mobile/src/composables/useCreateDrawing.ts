/**
 * 新建图纸（create-drawing 空白模板，后端自动补 .mxweb 后缀）
 *
 * 文件浏览器（个人空间）/ 项目详情共用一套创建逻辑，
 * 通过 getTargetId / refresh / undo 三个参数注入各自的 parentId 来源、列表刷新方式
 * 与撤销 snackbar 实例。撤销决策（彻底删除新建节点）内聚在本 composable，
 * 与 useFileNodeOps.onCreateFolderConfirm 对齐——页面不再各自重写回滚闭包。
 */
import { ref } from 'vue'
import {
  showToast,
  showLoadingToast,
  closeToast,
  showFailToast,
  showSuccessToast,
} from 'vant'
import {
  nodeControllerCreateDrawing,
  nodeControllerDeleteNode,
} from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { unwrap } from '@/utils/apiError'
import { validateName } from '@/utils/validateName'
import type { useUndoSnackbar } from '@/composables/useUndoSnackbar'

export function useCreateDrawing(
  getTargetId: () => string | null | undefined,
  refresh: () => Promise<void>,
  undo: ReturnType<typeof useUndoSnackbar>,
) {
  const showCreateDrawingDialog = ref(false)
  const drawingNameInput = ref('')

  function openCreateDrawingDialog() {
    showCreateDrawingDialog.value = true
    drawingNameInput.value = ''
  }

  async function onCreateDrawingConfirm() {
    // 名称可留空 → 后端默认「新建图纸」；非空时走共享名称校验（A-24）
    const rawName = drawingNameInput.value.trim()
    if (rawName) {
      const validation = validateName(rawName)
      if (!validation.valid) {
        showFailToast(validation.error ?? t('名称无效'))
        return
      }
    }
    const name = rawName || undefined
    const parentId = getTargetId()
    if (!parentId) {
      showFailToast(t('文件夹未就绪，请稍后再试'))
      return
    }

    showCreateDrawingDialog.value = false
    showLoadingToast({ message: t('创建中...'), forbidClick: true })
    try {
      const res = await nodeControllerCreateDrawing({
        body: { parentId, name },
      })
      closeToast()
      unwrap(res)
      showToast(t('图纸创建成功'))
      await refresh()
      // 创建成功才挂撤销入口（对齐 PC：无 createdId 不入栈）
      const createdId = (res.data as { id?: string } | undefined)?.id
      if (createdId) {
        // 撤销：彻底删除新建图纸（对齐 PC createDrawing undo rollback）
        undo.trackUndo(t('已创建图纸'), async () => {
          const r = await nodeControllerDeleteNode({
            path: { nodeId: createdId },
            query: { permanently: true },
          })
          unwrap(r)
          showSuccessToast(t('已撤销'))
          await refresh()
        })
      }
    } catch (e) {
      closeToast()
      showToast(t('创建失败，请重试'))
    }
  }

  return {
    showCreateDrawingDialog,
    drawingNameInput,
    openCreateDrawingDialog,
    onCreateDrawingConfirm,
  }
}
