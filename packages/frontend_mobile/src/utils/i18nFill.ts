import { t } from '@/languages'

/**
 * 手动插值（voerkai18n 运行时 flexvars 正则桥接缺陷的绕行方案）。
 *
 * flexvars@1.0.9 的 varWithPipeRegexp 在「两个占位符之间恰好是
 * 空格 + 单个纯 ASCII 单词 + 空格」时（如 "Remaining {months} months {days} days"），
 * 会把前缀/后缀组桥接成单个插值，输出乱码（"months}1{days"）。
 * CJK 文本与多词间隔不受影响。
 *
 * 规则：含多个占位符的 t() 调用一律改用本函数；
 * 单占位符字符串不受该缺陷影响，可继续用 t()。
 *
 * 原理：t(key) 不传 vars 时运行时原样返回翻译后的模板（占位符保留），
 * 此处手动 split/join 替换，完全绕过库的正则。
 *
 * 注意：voerkai18n extract 只识别 t()/$t() 调用，fillTemplate('...')
 * 的 key 不会被提取——多占位符 key 必须登记在 db-strings.json（手动输入源，
 * extract 不清除、compile 会合并进语言包），否则 extract 后 key 丢失、
 * 英文模式回退显示中文 key。
 */
export function fillTemplate(
  key: string,
  vars: Record<string, string | number>
): string {
  let result = t(key)
  for (const [name, value] of Object.entries(vars)) {
    result = result.split(`{${name}}`).join(String(value))
  }
  return result
}
