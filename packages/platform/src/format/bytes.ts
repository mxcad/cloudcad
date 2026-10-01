/**
 * 文件大小格式化——跨端共享的纯计算。
 *
 * 过去 PC `components/ui/FileSize.tsx` formatFileSize（log 选单位 B~TB、2 位小数、空→'-'）、
 * PC `components/modals/ExternalReferencePanel.tsx` 本地副本（B~GB、1 位小数、空→'--'）、
 * 移动端 `composables/useNodeFormatter.ts` formatSize（仅 B/KB/MB、1 位小数）三份口径不一。
 * 这里统一为 PC 主口径：log 选单位 B~TB、`parseFloat(toFixed(2))` 去尾零、空/0→'-'。
 * 单位符号（B/KB/…）是通用记号非 i18n 文案，直接返回完整字符串。
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const BASE = 1024;

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BASE)),
    UNITS.length - 1
  );
  return parseFloat((bytes / Math.pow(BASE, i)).toFixed(2)) + ' ' + UNITS[i];
}
