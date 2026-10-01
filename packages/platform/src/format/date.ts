/**
 * 绝对日期/时间格式化——跨端共享的纯计算（固定格式，locale 无关）。
 *
 * 过去 PC `utils/dateUtils.ts`（`Intl` 按运行时语言本地化、无效→'-'）与
 * 移动端 `utils/billing.ts`（固定 `YYYY-MM-DD[ HH:mm]`、空/无效→''）口径不一。
 * 这里统一为**固定 ISO-like 格式**（locale 无关、无 ICU 依赖、可排序、无歧义）：
 *   `formatDate` → `YYYY-MM-DD`
 *   `formatDateTime` → `YYYY-MM-DD HH:mm`
 *   `formatDateTimeWithSeconds` → `YYYY-MM-DD HH:mm:ss`
 * 空（null/undefined/''）与无效（NaN）一律 → ''。
 *
 * 口径决策（产品可改）：PC 原按界面语言本地化（如 en-US 显示 `10/01/2026, 14:30`），
 * 统一后改固定格式——对审计日志/操作历史/版本历史等时间戳更无歧义、可排序。
 * 如需保留本地化，可在此把 `datePart`/时间部分换成 `toLocaleString(locale, opts)`
 * （locale 作参数传入），端包无需再改。
 */

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function datePart(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(input: DateInput): string {
  const d = toDate(input);
  return d ? datePart(d) : '';
}

export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  return d
    ? `${datePart(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : '';
}

export function formatDateTimeWithSeconds(input: DateInput): string {
  const d = toDate(input);
  return d
    ? `${datePart(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    : '';
}
