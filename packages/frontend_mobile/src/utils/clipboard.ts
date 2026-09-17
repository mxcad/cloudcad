/**
 * 剪贴板写入的唯一出口（移动端）。
 *
 * 移动端主要跑在系统浏览器与微信 / 企业微信 webview 里，`navigator.clipboard`
 * 可能整体缺失（非安全上下文），即使存在也可能因页面失焦、iframe 沙箱或
 * Permissions Policy 被拒。所以必须特性检测 + 降级 + 手动复制三级兜底。
 *
 * 降级顺序不可反：execCommand 在 iOS Safari / webview 里不稳定，现代 API 优先。
 * 反向也不行——访问 `navigator.clipboard.writeText` 在 `clipboard` 为 undefined
 * 时抛的是 TypeError，不是 SecurityError，只靠 try/catch 会误判。
 *
 * 降级逻辑只存在于本文件；调用侧只消费 CopyResult，禁止各自 try/catch。
 * 实例：clipboard 曾散在 10 文件 15 调用点 4 套互不相同的降级策略。
 */

export type CopyPath = 'clipboard' | 'execCommand'
export type CopyResult = CopyPath | 'failed'

/** 特性检测：非安全上下文下 `navigator.clipboard` 为 undefined */
export function isClipboardApiAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard !== 'undefined' &&
    typeof navigator.clipboard.writeText === 'function'
  )
}

/**
 * execCommand 兜底：写入隐藏 textarea 后选中复制。
 * select/execCommand 整段包在 try/catch 里——部分 webview 的 select() 会直接抛错。
 */
export function fallbackCopyToHiddenTextarea(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.body === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  // readonly 避免 iOS Safari 弹全屏键盘；display:none 会让 select() 静默失效，
  // 改用 fixed + 屏外定位。
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  // 祖先 user-select:none 会让 select() 静默失效，必须显式覆盖。
  textarea.style.setProperty('user-select', 'text')
  textarea.style.setProperty('-webkit-user-select', 'text')

  document.body.appendChild(textarea)

  let ok = false
  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }

  document.body.removeChild(textarea)
  return ok
}

/** 复制文本。两级都失败返回 'failed'，调用方负责手动复制兜底。 */
export async function copyText(text: string): Promise<CopyResult> {
  if (isClipboardApiAvailable()) {
    try {
      await navigator.clipboard.writeText(text)
      return 'clipboard'
    } catch {
      // 权限被拒 / 页面失焦 / 沙箱拦截，继续降级
    }
  }

  if (fallbackCopyToHiddenTextarea(text)) return 'execCommand'
  return 'failed'
}
