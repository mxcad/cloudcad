/**
 * 新建图纸（create-drawing 空白模板，后端自动补 .mxweb 后缀）
 *
 * 文件浏览器（个人空间）/ 项目详情共用一套创建逻辑，
 * 通过 getTargetId / refresh 两个参数注入各自的 parentId 来源与列表刷新方式。
 */
import { ref } from 'vue'
import { showToast, showLoadingToast, closeToast, showFailToast } from 'vant'
import { nodeControllerCreateDrawing } from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { validateName } from '@/utils/validateName'

export function useCreateDrawing(
  getTargetId: () => string | null | undefined,
  refresh: () => Promise<void>,
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
      if (res.error) throw new Error(String(res.error))
      showToast(t('图纸创建成功'))
      await refresh()
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
