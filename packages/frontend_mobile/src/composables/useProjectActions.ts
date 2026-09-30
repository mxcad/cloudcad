/**
 * 项目级操作（我的项目卡片菜单 + 项目详情页管理菜单）：重命名 / 编辑 / 删除 / 转让所有权。
 *
 * 删除 = 软删（permanently=false，进回收站可恢复）；403 走权限文案。
 * 重命名/编辑复用 validateName 共享校验（A-24）；编辑走 UpdateNodeDto（name+description，
 * 长度对齐后端 @Length(1,100)/@Length(0,500)）。
 * 转让所有权 = 强确认（不可撤销 + 降级为管理员，对齐 PC MembersModal 文案）
 * → memberControllerTransferProject。
 * 所有操作返回 boolean 成功标志，供调用方决定后续动作（如删除后回退项目列表）。
 * 页面只接线 UI（菜单/弹窗），逻辑集中在本 composable 便于单测。
 */
import { showLoadingToast, closeToast, showSuccessToast, showFailToast, showDialog } from 'vant'
import {
  projectControllerUpdateProject,
  projectControllerDeleteProject,
  memberControllerTransferProject,
} from '@cloudcad/api-sdk/sdk.gen'
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
  async function rename(projectId: string, name: string): Promise<boolean> {
    const validation = validateName(name)
    if (!validation.valid) {
      showFailToast(validation.error ?? t('名称无效'))
      return false
    }
    showLoadingToast({ message: t('重命名中...'), forbidClick: true })
    try {
      const res = await projectControllerUpdateProject({ path: { projectId }, body: { name } })
      closeToast()
      if (res.error) throw res.error
      showSuccessToast(t('重命名成功'))
      await refresh()
      return true
    } catch (e) {
      closeToast()
      failToast(e)
      return false
    }
  }

  /** 编辑项目：校验名称 → PATCH（name + description）→ 成功 toast + 刷新 */
  async function update(
    projectId: string,
    payload: { name: string; description: string },
  ): Promise<boolean> {
    const validation = validateName(payload.name)
    if (!validation.valid) {
      showFailToast(validation.error ?? t('名称无效'))
      return false
    }
    showLoadingToast({ message: t('保存中...'), forbidClick: true })
    try {
      const res = await projectControllerUpdateProject({
        path: { projectId },
        body: { name: payload.name, description: payload.description },
      })
      closeToast()
      if (res.error) throw res.error
      showSuccessToast(t('保存成功'))
      await refresh()
      return true
    } catch (e) {
      closeToast()
      failToast(e)
      return false
    }
  }

  /** 删除项目：强确认（可取消）→ 软删（进回收站可恢复）→ 成功 toast + 刷新 */
  async function remove(projectId: string, name: string): Promise<boolean> {
    try {
      await showDialog({
        title: t('删除项目'),
        message: t('确定删除项目「{name}」？删除后可在回收站恢复。', { name }),
        showCancelButton: true,
        confirmButtonColor: '#ee0a24',
      })
    } catch {
      return false // 用户取消
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
      return true
    } catch (e) {
      closeToast()
      failToast(e)
      return false
    }
  }

  /** 转让所有权：强确认（不可撤销 + 降级为管理员）→ POST transfer → 成功 toast + 刷新 */
  async function transferOwnership(
    projectId: string,
    target: { id: string; name: string },
  ): Promise<boolean> {
    try {
      await showDialog({
        title: t('转让项目所有权'),
        message: t(
          '确定将项目所有权转让给「{name}」？转让后您将失去项目所有者权限，并自动降级为项目管理员。此操作不可撤销。',
          { name: target.name },
        ),
        showCancelButton: true,
        confirmButtonText: t('确认转让'),
        confirmButtonColor: '#ee0a24',
      })
    } catch {
      return false // 用户取消
    }
    showLoadingToast({ message: t('转让中...'), forbidClick: true })
    try {
      const res = await memberControllerTransferProject({
        path: { projectId },
        body: { newOwnerId: target.id },
      })
      closeToast()
      if (res.error) throw res.error
      showSuccessToast(t('转让成功'))
      await refresh()
      return true
    } catch (e) {
      closeToast()
      failToast(e)
      return false
    }
  }

  return { rename, update, remove, transferOwnership }
}
