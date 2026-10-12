/**
 * Express 通配参（`*path`）→ mxcad 斜杠路径（单一事实源）。
 *
 * Express 5 把 `*path` 交付成两种形态：多段时是 `string[]`，单段时被内部
 * `toString()` 成逗号串（如 `"YYYYMM,nodeId,file.mxweb"`）。后续的
 * `resolveWithinRoot` 等路径穿越守卫假定规范化已经发生——漏抄一处就静默改变
 * 守卫看到的字符串，因此还原必须只有一处实现。
 *
 * 本函数取代原 8 处内联副本（library.controller ×2、mxcad-file-access.controller、
 * mxcad-file-access.service ×3、mxcad-file-handler.service），其中
 * mxcad-file-access.controller 的 `extractPath` 还带一次恒等重复 replace。
 * 入参 `unknown`：兼容 `@Param()` 未声明类型的遗留调用点。
 */
export function normalizeMxcadPath(params: unknown): string {
  const value = Array.isArray(params) ? params.join('/') : String(params ?? '');
  return value.replace(/,/g, '/');
}
