/**
 * 剪贴板写入的唯一出口。
 *
 * 部署形态大量是内网 http（非安全上下文），此时 `navigator.clipboard` 整体为
 * `undefined`——访问 `navigator.clipboard.writeText` 会抛 TypeError，而不是
 * SecurityError，所以必须先做特性检测再 try/catch，不能只靠 catch 兜住。
 *
 * 降级链固定为：Clipboard API → execCommand（隐藏 textarea）→ 交给调用方手动复制。
 * 反向不可行：execCommand 在 iOS Safari / 微信与企业微信 webview 里不稳定，
 * 且受 Permissions Policy、页面失焦、iframe 沙箱影响；现代 API 才是首选。
 *
 * 降级逻辑只存在于本文件，调用侧只消费返回的 CopyResult，禁止各自 try/catch
 * 出一套降级顺序（实例：clipboard 曾散在 10 文件 15 调用点 4 套互不相同的策略）。
 */

export type CopyPath = 'clipboard' | 'execCommand';
export type CopyResult = CopyPath | 'failed';

/** 特性检测：非安全上下文下 `navigator.clipboard` 为 undefined。 */
export function isClipboardApiAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard !== 'undefined' &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * execCommand 兜底：写入隐藏 textarea 后选中复制。
 *
 * 整段 select/execCommand 必须包在 try/catch 里——部分 webview 的 `select()`
 * 会直接抛错，不能让它变成未处理异常。
 */
export function fallbackCopyToHiddenTextarea(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.body === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // readonly 避免 iOS Safari 弹全屏键盘；display:none 会让 select() 静默失效，
  // 所以改用 fixed + 屏外定位。
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  // 祖先 user-select:none 会让 select() 静默失效，必须显式覆盖。
  textarea.style.setProperty('user-select', 'text');
  textarea.style.setProperty('-webkit-user-select', 'text');

  document.body.appendChild(textarea);

  let ok = false;
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  return ok;
}

/**
 * 复制文本。返回走通了哪一级；两级都失败返回 'failed'，
 * 调用方负责手动复制兜底（readonly 输入框 + 提示）。
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (isClipboardApiAvailable()) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // 权限被拒 / 页面失焦 / Permissions Policy 拦截，继续降级
    }
  }

  if (fallbackCopyToHiddenTextarea(text)) return 'execCommand';
  return 'failed';
}
