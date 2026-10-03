/**
 * 客服联系方式解析（移动端唯一出口）。
 *
 * `supportEmail` / `supportPhone` 两项运行时配置的 defaultValue 都是空串——
 * 部署方没填的时候不能再拿 support@cloudcad.com / 400-123-4567 这类编造的
 * 联系方式糊到用户眼前：用户照着 mailto: 点过去只会收到退信，比不显示更糟。
 * 因此这里只返回真实配置值，`configured` 标明是否有可展示项，
 * 由调用方决定降级成「请联系管理员」这类提示。
 */
export interface SupportContact {
  email: string
  phone: string
  /** 邮箱或电话至少配了一项才为 true */
  configured: boolean
}

/** 严格判型：脏数据（数字、null）按空处理，不抛错——与 useRuntimeConfig 的 stringField 一致 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveSupportContact(
  runtime: { supportEmail?: string; supportPhone?: string } = {},
): SupportContact {
  const email = asText(runtime.supportEmail)
  const phone = asText(runtime.supportPhone)
  return { email, phone, configured: Boolean(email || phone) }
}
