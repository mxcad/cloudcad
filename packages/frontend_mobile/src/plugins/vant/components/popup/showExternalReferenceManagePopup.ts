import { h, render } from 'vue'
import ExternalRefManagePopup from './ExternalRefManagePopup.vue'
import type { ExtRefContext, ExtRefItem } from '@/services/extRefManageService'

export interface ShowExternalReferenceManagePopupParam {
  ctx: ExtRefContext
  /** 调用方预取的列表（自动打开流程传入，避免面板二次拉取） */
  initialFiles?: ExtRefItem[]
  /** 是否可上传/替换（节点场景按权限；公开场景默认 true） */
  canManage?: boolean
}

/**
 * 命令式打开外部参照管理面板（E-26）：列出全部参照（含已存在与缺失），
 * 支持查看/下载/替换/上传 + 刷新。关闭时 resolve。
 */
export const showExternalReferenceManagePopup = (
  param: ShowExternalReferenceManagePopupParam
): Promise<void> => {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let mounted: ReturnType<typeof h> | null = null

    const vnode = h(ExternalRefManagePopup, {
      ctx: param.ctx,
      initialFiles: param.initialFiles,
      canManage: param.canManage,
      onClose() {
        if (mounted) {
          render(null, container)
          mounted = null
        }
        container.remove()
        resolve()
      },
    })
    mounted = vnode
    render(vnode, container)
  })
}
