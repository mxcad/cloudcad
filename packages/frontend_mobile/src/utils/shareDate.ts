import { t } from '@/languages'

/**
 * 分享到期时间展示——唯一出口（对齐 PC formatExpiryDate）。
 *
 * null/undefined = 永不过期；有效日期本地化展示。`withTime` 分档对齐 PC ShareDialog
 * 口径：列表行仅日期（toLocaleDateString），创建成功面板含时分（toLocaleString）。
 * 两端日期口径一致（C-28），勿只改一端制造跨端不一致。
 */
export function formatShareExpiry(
  dateStr: string | null | undefined,
  withTime = false,
): string {
  if (!dateStr) return t('永不过期')
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return t('永不过期')
  return withTime ? d.toLocaleString() : d.toLocaleDateString()
}
