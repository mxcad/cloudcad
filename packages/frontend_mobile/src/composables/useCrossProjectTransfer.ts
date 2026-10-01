/**
 * 跨项目移动/复制的策略预判编排（二期 g，页面级）。
 *
 * 打开文件夹选择器前 init(source) 拉源项目设置；切目标根时 onRootChange 拉目标设置并
 * 重算六域矩阵判定（precheckTransfer）。disabledReason 非空 → 选择器禁用确认+红字。
 * 后端仍是最终裁决（权限/配额/策略），这里只做确认前预判，避免用户走完流程才被 403。
 */
import { ref, computed } from 'vue'
import { t } from '@/languages'
import type {
  LocalizedTransferVerdict,
  TransferRoot,
  TransferSettings,
} from '@/utils/transferPolicy'
import {
  fetchProjectTransferSettings,
  precheckTransfer,
} from '@/utils/transferPolicy'

export function useCrossProjectTransfer() {
  const sourceRoot = ref<TransferRoot | null>(null)
  const targetRoot = ref<TransferRoot | null>(null)
  const operation = ref<'move' | 'copy'>('move')
  const sourceSettings = ref<TransferSettings | null>(null)
  const targetSettings = ref<TransferSettings | null>(null)
  const verdict = ref<LocalizedTransferVerdict>({ allowed: true })

  async function init(source: TransferRoot, op: 'move' | 'copy'): Promise<void> {
    sourceRoot.value = source
    operation.value = op
    sourceSettings.value = source.domain === 'project' ? await fetchProjectTransferSettings(source.id) : null
    // 初始目标=源根（同域无策略约束）
    targetRoot.value = source
    targetSettings.value = sourceSettings.value
    verdict.value = { allowed: true }
  }

  async function onRootChange(rootId: string, roots: TransferRoot[]): Promise<void> {
    const target = roots.find((r) => r.id === rootId)
    if (!target) return
    targetRoot.value = target
    targetSettings.value = target.domain === 'project' ? await fetchProjectTransferSettings(target.id) : null
    reevaluate()
  }

  function reevaluate(): void {
    if (!sourceRoot.value || !targetRoot.value) return
    verdict.value = precheckTransfer(
      sourceRoot.value,
      targetRoot.value,
      operation.value,
      sourceSettings.value,
      targetSettings.value,
    )
  }

  const isCrossProject = computed(
    () => !!sourceRoot.value && !!targetRoot.value && sourceRoot.value.id !== targetRoot.value.id,
  )

  const disabledReason = computed(() => {
    if (verdict.value.allowed) return ''
    return t(verdict.value.reasonKey ?? '', verdict.value.reasonParams)
  })

  return { sourceRoot, targetRoot, operation, verdict, isCrossProject, disabledReason, init, onRootChange }
}
