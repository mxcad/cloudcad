/**
 * 分享链接绝对化——移动端唯一出口。
 *
 * 后端 share 端点（create/list/file/update）返回的 `url` 一律是**相对 path**
 * （`/cad-editor/{fileId}?shareToken=…`）。复制、二维码、新窗口打开都需要绝对 URL——
 * 裸 path 粘进浏览器地址栏会被当成搜索词，扫码同样打不开。
 *
 * 绝对化规则本身收敛在 @cloudcad/platform 的 `toShareUrl`（两端共用的唯一出口），
 * 这里只负责供 origin，避免业务代码各处内联 `window.location`。
 */
import { toShareUrl } from '@cloudcad/platform'

export function shareUrl(path: string | null | undefined): string {
  return toShareUrl(path, window.location.origin)
}
