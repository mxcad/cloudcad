///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * XSS 防护工具 — HTML 转义
 *
 * 将用户可控字符串安全插入 innerHTML / 模板字符串中，
 * 防止恶意文件名等数据注入 <script> 标签或事件处理器。
 *
 * 使用纯字符串替换实现，不依赖 DOM API，
 * 避免 document.createTextNode 在 SSR / 非浏览器环境下的问题。
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 将字符串中的 HTML 特殊字符转义为实体引用
 * @param str 待转义的原始字符串
 * @returns 安全的 HTML 实体字符串
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}
