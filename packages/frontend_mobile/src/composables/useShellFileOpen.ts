import { useRouter } from 'vue-router'
import { showFailToast } from 'vant'
import { t } from '@/languages'
import { useEditorState } from '@/composables/useEditorState'
import { useFileLoader } from '@/composables/useFileLoader'
import { useShellStack, type ShellReturnTarget } from '@/stores/shellStack'

/**
 * 壳子页（项目详情 / 个人空间文件页）打开图纸的统一入口。
 *
 * 必须走 useFileLoader.loadByNodeId 而非 openMxWeb 直拼 URL：后者只设 isActive + fileName，
 * editorState.state.fileId 恒为空 —— 保存会退化成「另存为到云图」，openFileComplete 的
 * if (fileId) 缩略图上传也不触发。loadByNodeId 才会补齐节点信息、权限、projectId、
 * IndexedDB mxweb 缓存与 updatedAt 版本戳，并处理已删除/未转换完成的错误。
 *
 * 打开成功后用 router.replace('/shell') 而不是 router.back()：back 从
 * /shell/file/project/:id 会回到 /shell/file，仍是子页，画布照样被盖住；直接进子页时
 * 甚至会退出 SPA。replace('/shell') 确定性地露出画布，返回由壳顶栏箭头负责。
 */
export function useShellFileOpen() {
  const router = useRouter()
  const editorState = useEditorState()
  const shellStack = useShellStack()
  const { loadByNodeId } = useFileLoader()

  async function openFromList(
    nodeId: string,
    returnTarget: ShellReturnTarget,
  ): Promise<boolean> {
    shellStack.setReturnTarget(returnTarget)

    // 清掉上一次的文件上下文与错误（保留 isModified/isActive/loading）
    editorState.resetFileState()

    const opened = await loadByNodeId(nodeId)
    if (!opened) {
      // 错误 overlay 会被当前子页盖住，改为 toast 提示后留在原页
      editorState.setError(null)
      editorState.setErrorType(null)
      showFailToast(t('打开文件失败'))
      return false
    }

    router.replace('/shell')
    return true
  }

  return { openFromList }
}
