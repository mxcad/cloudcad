/**
 * 跨项目转移目标根列表（二期 g，等价 PC useTransferTargetRoots）：
 * 个人空间 + 我的项目（排除已删除）。弹窗打开时才拉取（项目列表可能很长，limit 200 兜底）。
 */
import { ref } from 'vue'
import { projectControllerGetProjects } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import type { TransferRoot } from '@/utils/transferPolicy'

export function useTransferTargets() {
  const roots = ref<TransferRoot[]>([])
  const loading = ref(false)

  async function load(personalSpaceId: string | null): Promise<void> {
    loading.value = true
    try {
      const list: TransferRoot[] = []
      if (personalSpaceId) {
        list.push({ id: personalSpaceId, name: t('个人空间'), domain: 'personalSpace' })
      }
      const res = await projectControllerGetProjects({ query: { page: 1, limit: 200 } })
      if (!res.error) {
        const data = (res.data ?? {}) as { nodes?: FileSystemNodeDto[] }
        for (const n of data.nodes ?? []) {
          if (n.nodeType === 'PROJECT' && !n.deletedAt) {
            list.push({ id: n.id, name: n.name, domain: 'project' })
          }
        }
      }
      roots.value = list
    } catch {
      roots.value = []
    } finally {
      loading.value = false
    }
  }

  return { roots, loading, load }
}
