/**
 * Webhook 告警模板渲染——alert 生产发送（WebhookService）与 runtime-config
 * 通道测试动作（WebhookChannelTestAction）共享的唯一事实源。
 *
 * 占位符形如 `{{message}}`，替换时未识别的占位符原样保留。替换值须先经
 * escapeJsonText 做 JSON 文本转义（防止部署方模板里的 `{{...}}` 值破坏 JSON
 * 结构）；转义由调用方完成——各调用方替换值来源不同（生产 = WebhookAlertInput，
 * 测试 = 固定样例），本模块只承载「按 key 替换 + 未识别占位符保留」这一纯算法，
 * 不含任何值来源逻辑。
 *
 * 纯函数、无 IO、不触达运行时全局对象（过 scan:purity 门禁）。
 */

/** 对单个值做 JSON 文本转义（去掉 JSON.stringify 的首尾引号）。 */
export function escapeJsonText(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/**
 * 渲染模板：把 `{{key}}` 占位符替换为 replacements[key]（须已转义）；
 * 未识别的占位符原样保留。
 */
export function renderTemplate(
  template: string,
  replacements: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => replacements[key] ?? match,
  );
}
