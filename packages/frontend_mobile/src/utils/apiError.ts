/**
 * SDK 错误契约：把 @cloudcad/api-sdk 的响应与错误归一成可判定的 Error。
 *
 * 这是解包/归一能力的**唯一出口**。历史上同一套三件套（toError / unwrap /
 * errMsg）散落在 4 处：authFeedback.ts、ProfilePage.vue、useMemberCenter.ts、
 * 各 auth 页的历史副本。更糟的是语义已经分叉——裸版本只认 `res.error`，
 * 不识别落在 `res.data.code` 上的字符串型业务码，于是
 * `{ code: 'EMAIL_NOT_VERIFIED', message: ... }` 会被当成成功数据吞掉，
 * 调用方拿到的是错误体而不是抛错。
 *
 * 新增消费者一律 import 本文件，不要再看 authFeedback.ts 的同名再导出。
 * 纯函数、无 IO、无框架依赖；vant 弹层与账号状态弹窗留在 authFeedback.ts。
 *
 * 契约对齐：后端把业务码放在 error body 的 `code` 字段（如
 * ACCOUNT_DEACTIVATED / EMAIL_NOT_VERIFIED），`message` 是按
 * Accept-Language 本地化后的中文，**不含字面码**。所以 toError 必须把
 * code 与随错误体附带的 tempToken / email / phone / cleanupDays 一并保留，
 * 否则登录页的业务码分支（EMAIL_NOT_VERIFIED → 邮箱验证、EMAIL_REQUIRED
 * → 补绑）永远走不到，只能显示笼统文案。
 */

/** 后端错误体里前端会读到的业务字段 */
export interface ApiErrorBody {
  code?: string
  graceDays?: number
  cleanupDays?: number
  tempToken?: string
  email?: string
  phone?: string
  /** 数值型 code 路径下的原始响应体（apiConfig.responseTransformer 挂在这里） */
  data?: unknown
}

/** SDK 抛出的业务错误：Error.message 是后端本地化文案，附加字段是业务码与载荷 */
export type ApiError = Error & ApiErrorBody

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  return value as Record<string, unknown>
}

function strField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key]
  return typeof value === 'string' && value ? value : undefined
}

function numField(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 把 SDK 返回的 error 归一成 Error。
 * 保留后端本地化的 message，并把业务码与载荷字段挂到 Error 实例上。
 * 兼容三层来源：业务错误体本身 / Axios 的 { response: { data } } 包壳 / 字符串。
 */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err

  // Axios 形态（部分场景 SDK 抛原生错误）：真正的 body 在 error.response.data
  const errAny = err as Record<string, unknown> | null
  const response = asRecord(errAny?.response)
  const responseData = asRecord(response?.data)
  const raw = responseData ?? asRecord(err) ?? {}

  const message = strField(raw, 'message') ?? (errAny?.message as string) ?? String(err)
  const e = new Error(message) as ApiError
  // 逐字段写：TS 对 `Error & T` 交集按联合键赋值会推导出 undefined 写入类型
  e.code = strField(raw, 'code')
  e.graceDays = numField(raw, 'graceDays')
  e.cleanupDays = numField(raw, 'cleanupDays')
  e.tempToken = strField(raw, 'tempToken')
  e.email = strField(raw, 'email')
  e.phone = strField(raw, 'phone')
  e.data = raw.data
  return e
}

/**
 * 解包 SDK 响应：error 非空即抛，否则返回 data。
 *
 * 字符串型业务码（EMAIL_NOT_VERIFIED / ACCOUNT_DEACTIVATED 等）不会被
 * apiConfig.responseTransformer 抛出——body 原样落在 res.data 上（含 code
 * 字段），所以这里必须二次识别：data.code 是字符串即业务错误体，转 Error 抛出。
 * 数值型 code 已被 responseTransformer 抛成 Error，走上面的 res.error 分支。
 */
export function unwrap<T>(res: { error?: unknown; data?: unknown }): T {
  if (res.error) throw toError(res.error)
  const data = res.data
  const code = asRecord(data)?.code
  if (typeof code === 'string' && code) {
    // 'SUCCESS' 是全局 ResponseInterceptor 的成功包壳，其 data 正常已被
    // responseTransformer 解开；兜底再解一层，避免调用方拿到包壳
    if (code === 'SUCCESS') return (asRecord(asRecord(data)?.data) ?? data) as T
    throw toError(data)
  }
  return (data ?? {}) as T
}

/** 展示用错误文案：裸字符串 → Error.message → 错误体 message → 兜底文案 */
export function errMsg(e: unknown, fallback: string): string {
  // SDK 的 res.error 可能是裸字符串（如 'quota exceeded'），直通而非塌成兜底文案
  if (typeof e === 'string' && e) return e
  const body = asRecord(e)
  const message = body?.message
  if (typeof message === 'string' && message) return message
  if (e instanceof Error && e.message) return e.message
  return fallback
}

/**
 * 业务错误码（ACCOUNT_DEACTIVATED / EMAIL_NOT_VERIFIED 等）。
 * message 是本地化文案不含字面码，无法从文案反推；只认字符串型 code。
 *
 * 普通路径下 body 就是错误体，code 在顶层；
 * apiConfig.responseTransformer 抛出的 Error 则把数值型 code 挂在自己身上、
 * 原始错误体挂在 data 里，所以顶层不是字符串时才回退查 data.code。
 */
export function errorCode(e: unknown): string | null {
  const body = asRecord(e)
  if (!body) return null
  if (typeof body.code === 'string' && body.code) return body.code
  const nested = asRecord(body.data)?.code
  return typeof nested === 'string' && nested ? nested : null
}

/** 读取业务错误体里的单个载荷字段（tempToken / email / phone / cleanupDays 等） */
export function errorDetail<K extends keyof ApiErrorBody>(e: unknown, key: K): ApiErrorBody[K] {
  return ((asRecord(e) ?? {}) as Partial<ApiErrorBody>)[key]
}

// ── typed error：错误类别单一出口 ──
//
// 历史：throw 点抛本地化文案 new Error(t('文件已被删除'))，catch 点用
// message.includes('文件已被删除') 字符串反推错误类别——非中文 locale 下
// message 被翻译，专属错误 UI 永远不可达。改为 throw 点直接携带 kind，
// catch 点读 kind；任意来源错误的类别判定统一走 errorKind()。

/** 错误类别（按实际 catch 分支归纳） */
export type ApiErrorKind =
  | 'deleted' // 文件已被删除（deletedAt）
  | 'converting' // 文件尚未转换完成（无 fileHash）
  | 'open-failed' // 引擎打开 mxweb 失败
  | 'not-found' // 404 / 分享链接失效
  | 'network' // 网络异常 / 离线
  | 'unauthorized' // 401 / UNAUTHORIZED / AUTH_TOKEN_*
  | 'forbidden' // 403 / PERMISSION_DENIED / FORBIDDEN
  | 'deactivated' // 账号被禁用 / 注销
  | 'unknown'

const API_ERROR_KINDS: readonly string[] = [
  'deleted',
  'converting',
  'open-failed',
  'not-found',
  'network',
  'unauthorized',
  'forbidden',
  'deactivated',
  'unknown',
]

function isApiErrorKind(value: unknown): value is ApiErrorKind {
  return typeof value === 'string' && API_ERROR_KINDS.includes(value)
}

/** 后端字符串业务码 → kind（SDK 对非 2xx throw body，无 status 字段，401 靠 code） */
const CODE_KINDS: Record<string, ApiErrorKind> = {
  ACCOUNT_DEACTIVATED: 'deactivated',
  UNAUTHORIZED: 'unauthorized',
  AUTH_TOKEN_EXPIRED: 'unauthorized',
  AUTH_TOKEN_INVALID: 'unauthorized',
  AUTH_TOKEN_MISSING: 'unauthorized',
  FORBIDDEN: 'forbidden',
  PERMISSION_DENIED: 'forbidden',
}

const NETWORK_CODES = new Set([
  'ERR_NETWORK',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
])

/** 网络形态判定（合并原 errorHandler.isNetworkError 与 useAuthState._isNetworkError 两套规则） */
function isNetworkLike(e: Record<string, unknown>): boolean {
  const code = e.code
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return true
  const name = typeof e.name === 'string' ? e.name : ''
  const message = typeof e.message === 'string' ? e.message : ''
  if (
    name === 'TypeError' &&
    (message.includes('NetworkError') || message.includes('Failed to fetch'))
  ) {
    return true
  }
  return (
    message.includes('Network Error') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('network') ||
    message.includes('Network')
  )
}

/** 携带类别的错误：throw 点用它替代裸 Error + 文案反推（message 仍是本地化文案供展示） */
export interface TypedApiError extends ApiError {
  kind: ApiErrorKind
}

export function typedError(kind: ApiErrorKind, message: string): TypedApiError {
  return Object.assign(new Error(message), { kind }) as TypedApiError
}

/**
 * 任意错误的类别判定单一出口。优先级：
 *   typed kind → HTTP status / 数值 code（401/403/404）→ 字符串业务码 → 网络形态 → unknown
 */
export function errorKind(e: unknown): ApiErrorKind {
  const rec = asRecord(e)
  if (!rec) return 'unknown'
  if (isApiErrorKind(rec.kind)) return rec.kind
  if (rec.isPermissionError === true) return 'forbidden'
  const status = [rec.code, rec.status, rec.statusCode, asRecord(rec.response)?.status].find(
    (v) => typeof v === 'number'
  )
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  const code = errorCode(e)
  if (code) {
    const kind = CODE_KINDS[code]
    if (kind) return kind
  }
  if (isNetworkLike(rec)) return 'network'
  return 'unknown'
}
