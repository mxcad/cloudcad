///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 校验失败后把焦点移到第一个出错的字段。
 *
 * 表单把字段名变成一条错误文案还不够——用户仍要自己挨个去找哪个框出了问题。
 * 这里按调用方声明的字段展示顺序滚动并聚焦首个出错项，让用户直接落在该改的地方。
 *
 * 字段侧还需自行配好 `aria-invalid` / `aria-describedby`，否则屏幕阅读器只读到
 * 「此字段有误」而读不到具体原因（WCAG 3.3.1 / 3.3.2）。
 */
export function focusFirstInvalid(
  errors: Record<string, string>,
  fieldOrder: readonly string[]
): void {
  for (const field of fieldOrder) {
    if (!errors[field]) continue;

    // 字段可能属于当前未渲染的步骤（或按配置条件隐藏），跳过而不是提前返回——
    // 否则聚焦静默失效，用户会以为提交没反应
    const el = document.getElementById(field);
    if (!el) continue;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    return;
  }
}
