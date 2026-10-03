/**
 * 分享链接绝对化——跨端共享的纯计算。
 *
 * 背景：后端 `createShare` / `listShares` / `getFileShares` 返回的 `url` 一律是
 * **相对 path**（`/cad-editor/{fileId}?shareToken=…`）。此前两端都不绝对化，
 * 且 PC 自身不自洽——创建成功的 QRCodeSVG / ShareLinkBar 前置 `window.location.origin`，
 * 而列表行复制的是裸 path。移动端 6 处复制/二维码也全是裸 path。
 *
 * 裸 path 交给接收方是坏体验：粘进浏览器地址栏会被当成搜索词，二维码扫描同样打不开。
 * 这里收敛为唯一出口，两端各自传自己的 `window.location.origin`（保持纯函数，
 * platform 不读浏览器 API）。
 */

/**
 * 把后端返回的分享 path 绝对化为可复制 / 可扫码的完整 URL。
 *
 * 已绝对化的值原样返回——端侧不会拼出重复 origin 的前缀，历史数据或未来后端
 * 改成直接返回完整 URL 都不会产生 `https://host/https://host/...` 这类双层前缀。
 *
 * 空串返回空串：调用方通常用 `v-if="url"` / `if (!url) return` 兜住，
 * 这里不产生 `undefined` 或 `null`，避免模板里渲染出字面量 `null`。
 *
 * `protocolRelative`（`//host/path`）也视为已绝对化：浏览器能正确解析，
 * 且它天然跟随当前协议，不该被强加 origin。
 */
export function toShareUrl(path: string | null | undefined, origin: string): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (!trimmed.startsWith('/')) return trimmed;
  const base = origin.replace(/\/+$/, '');
  return `${base}/${trimmed.replace(/^\/+/, '')}`;
}
