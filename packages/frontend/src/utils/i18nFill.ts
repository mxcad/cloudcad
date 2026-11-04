import { t } from "@/languages";

/**
 * 手动插值（voerkai18n 运行时 flexvars 正则桥接缺陷的绕行方案）。
 *
 * flexvars 的 varWithPipeRegexp 前缀组 `([\S]+\s)?` 会贪婪吞掉首个占位符的
 * 闭括号与空格，当两个占位符之间恰好是「空格 + 纯 ASCII 单词 + 空格」时
 * （如 en "Remaining {months} months {days} days"），会把 `{p1} W {p2}` 整段
 * 合并成单个插值，输出乱码（"Remaining months}1{days days"）。
 *
 * 本函数先用 t() 取翻译后的模板（不传变量时运行时直接返回原文，占位符原样
 * 保留），再手动替换占位符，完全绕开库内正则。**含多个占位符的 t() 调用
 * 一律改用本函数**；单占位符字符串不受该缺陷影响，可继续用 t()。
 */
export function fillTemplate(
  key: string,
  vars: Record<string, string | number>
): string {
  let result = t(key);
  for (const [name, value] of Object.entries(vars)) {
    result = result.split(`{${name}}`).join(String(value));
  }
  return result;
}
