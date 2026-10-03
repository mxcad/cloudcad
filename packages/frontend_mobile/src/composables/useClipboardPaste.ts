/**
 * 剪贴板粘贴预判（对齐 PC useFileBrowserActions 的 pasteVerdict / canPaste / pasteDisabledReason）。
 *
 * 按「剪贴板源根 × 当前目标根」评估 6 域转移矩阵（precheckTransfer，与 PC 共用 platform 判定）：
 * 策略禁止跨项目转移 → canPaste=false + pasteDisabledReason（粘贴按钮禁用 + 红字原因），
 * 避免用户点粘贴后才被后端 403。乐观放行：判定未就绪（目标入向策略拉取中 / 同根 / 无剪贴板）
 * 时 canPaste=true，拉取完成若禁止再收紧——与 PC「verdict 未就绪不拦截」语义一致。
 *
 * 目标根每页固定（个人空间 / 当前项目），由调用方以 getter 传入（id 可能异步就绪）。
 * 仅目标为项目且跨根时才拉目标入向策略（个人空间无入向字段，恒由源出向策略 + 归属权限兜底）。
 * 后端仍是最终裁决（权限/配额/策略）。
 */
import { ref, computed, watch, onScopeDispose } from 'vue'
import { t } from '@/languages'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'
import {
  precheckTransfer,
  fetchProjectTransferSettings,
  type LocalizedTransferVerdict,
  type TransferDomain,
} from '@/utils/transferPolicy'

export function useClipboardPaste(getTarget: () => { id: string; domain: TransferDomain }) {
  const clipboard = useFileSystemClipboard()
  const target = computed(getTarget)
  const verdict = ref<LocalizedTransferVerdict | null>(null)

  // 代际计数防竞态：快速切换剪贴板/目标时只有最新一次判定生效
  let gen = 0

  watch(
    () => [
      clipboard.itemIds,
      clipboard.mode,
      clipboard.sourceRootId,
      clipboard.sourceRootKind,
      clipboard.sourceTransferSettings,
      target.value.id,
      target.value.domain,
    ],
    async () => {
      const myGen = ++gen
      const tgt = target.value
      // 无剪贴板 / 目标未就绪 → 判定挂起（乐观放行）
      if (!clipboard.hasItems || !clipboard.mode || !tgt.id) {
        verdict.value = null
        return
      }
      const source = { id: clipboard.sourceRootId, domain: clipboard.sourceRootKind }
      // 同根（同项目/同个人空间）无跨项目策略约束
      if (source.id === tgt.id && source.domain === tgt.domain) {
        verdict.value = null
        return
      }
      const op = clipboard.mode === 'cut' ? 'move' : 'copy'
      // 目标为项目才需拉入向策略（transferInFrom*）；个人空间无入向字段
      const targetSettings =
        tgt.domain === 'project' ? await fetchProjectTransferSettings(tgt.id) : null
      if (myGen !== gen) return
      verdict.value = precheckTransfer(
        source,
        tgt,
        op,
        source.domain === 'project' ? clipboard.sourceTransferSettings : null,
        targetSettings,
      )
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    gen++
  })

  const canPaste = computed(() => verdict.value?.allowed !== false)
  const pasteDisabledReason = computed(
    () =>
      verdict.value?.allowed === false
        ? t(verdict.value.reasonKey ?? '', verdict.value.reasonParams)
        : '',
  )

  return { canPaste, pasteDisabledReason }
}
