import { onScopeDispose, ref } from 'vue'
import { showToast } from 'vant'
import { copyText } from '@/utils/clipboard'
import { t } from '@/languages'

/**
 * 分享链接复制（移动端唯一出口）：copyText → 失败回落手动复制面板 → 成功行内反馈。
 *
 * 收敛自两处逐字重复的实现：ShareManagePage 的 `copyLinkWithFallback` 与
 * ShareCurrentPopup 的 `copyShareUrl`（各自维护 ShareLinkSheet 回落 refs + toast）。
 *
 * `copiedKey` 用被复制的 url 本身当键：5 个复制按钮都能用「copiedKey === 自己的 url」
 * 判定，无需再传 token。对齐 PC ShareDialog 的 `copiedToken`（图标变 ✓ 2s）。
 *
 * 连续复制不同链接时后一次立即覆盖前一次显示并复用同一个定时器，不会出现
 * 「刚点第二个又被第一个的定时器清掉」的闪回。
 */
export function useShareLinkCopy(durationMs = 2000) {
  const copiedKey = ref('')
  const showLinkSheet = ref(false)
  const linkSheetUrl = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearCopiedKey() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      copiedKey.value = ''
      timer = undefined
    }, durationMs)
  }

  /** 复制成功返回 true；失败回落 ShareLinkSheet 手动复制面板，返回 false */
  async function copy(url: string): Promise<boolean> {
    if (!url) return false
    const result = await copyText(url)
    if (result === 'failed') {
      linkSheetUrl.value = url
      showLinkSheet.value = true
      return false
    }
    copiedKey.value = url
    clearCopiedKey()
    showToast(t('已复制链接'))
    return true
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { copiedKey, showLinkSheet, linkSheetUrl, copy }
}
