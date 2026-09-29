/**
 * 项目级操作（我的项目 tab 长按菜单）：重命名 / 删除。
 *
 * 删除 = 软删（permanently=false，进回收站可恢复）；403 走权限文案。
 * 重命名复用 validateName 共享校验（A-24），只传 name 不碰 description。
 * 页面只接线 UI（长按菜单/重命名弹窗），逻辑集中在本 composable 便于单测。
 */
import { showLoadingToast, closeToast, showSuccessToast, showFailToast, showDialog } from 'vant'
import { projectControllerUpdateProject, projectControllerDeleteProject } from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { validateName } from '@/utils/validateName'
import { errorKind, errMsg } from '@/utils/apiError'

function failToast(e: unknown): void {
  if (errorKind(e) === 'forbidden') {
    showFailToast(t('没有执行此操作的权限'))
    return
  }
  showFailToast(errMsg(e, t('操作失败')))
}

export function useProjectActions(refresh: () => Promise<void>) {
  /** 重命名项目：校验 → PATCH（只传 name）→ 成功 toast + 刷新 */
  async function rename(projectId: string, name: string): Promise<void> {
    const validation = validateName(name)
    if (!validation.valid) {
      showFailToast(validation.error ?? t('名称无效'))
      return
    }
    showLoadingToast({ message: t('重命名中...'), forbidClick: true })
    try {
      const res = await projectControllerUpdateProject({ path: { projectId }, body: { name } })
      closeToast()
      if (res.error) throw res.error
      showSuccessToast(t('重命名成功'))
      await refresh()
    } catch (e) {
      closeToast()
      failToast(e)
    }
  }

  /** 删除项目：强确认（可取消）→ 软删（进回收站可恢复）→ 成功 toast + 刷新 */
  async function remove(projectId: string, name: string): Promise<void> {
    try {
      await showDialog({
        title: t('删除项目'),
        message: t('确定删除项目「{name}」？删除后可在回收站恢复。', { name }),
        showCancelButton: true,
        confirmButtonColor: '#ee0a24',
      })
    } catch {
      return // 用户取消
    }
    showLoadingToast({ message: t('删除中...'), forbidClick: true })
    try {
      const res = await projectControllerDeleteProject({
        path: { projectId },
        query: { permanently: false },
      })
      closeToast()
      if (res.error) throw res.error
      showSuccessToast(t('删除成功'))
      await refresh()
    } catch (e) {
      closeToast()
      failToast(e)
    }
  }

  return { rename, remove }
}
