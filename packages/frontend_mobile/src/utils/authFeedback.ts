/**
 * 认证表单错误处理 + 账号状态弹窗。
 *
 * 登录 / 注册 / 绑定 / 找回密码等原生页共用的错误解包工具，
 * 从 LoginPage / RegisterPage 的页面内副本提取而来。
 *
 * 契约对齐：后端把业务码放在 error body 的 `code` 字段（如
 * ACCOUNT_DEACTIVATED / EMAIL_NOT_VERIFIED），`message` 是按
 * Accept-Language 本地化后的中文，**不含字面码**。所以 toError 必须把
 * code 与随错误体附带的 tempToken / email / phone / cleanupDays 一并保留，
 * 否则登录页的业务码分支（EMAIL_NOT_VERIFIED → 邮箱验证、EMAIL_REQUIRED
 * → 补绑）永远走不到，只能显示笼统文案。
 */
import { showDialog, showToast } from 'vant'
import 'vant/es/dialog/style'
import 'vant/es/toast/style'
import { t } from '@/languages'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'

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

/** 展示用错误文案：Error.message → 错误体 message → 兜底文案 */
export function errMsg(e: unknown, fallback: string): string {
  const body = asRecord(e)
  const message = body?.message
  if (typeof message === 'string' && message) return message
  if (e instanceof Error && e.message) return e.message
  return fallback
}

/**
 * 业务错误码（ACCOUNT_DEACTIVATED / EMAIL_NOT_VERIFIED 等）。
 * message 是本地化文案不含字面码，无法从文案反推；仅 body.code 可信，
 * 数值型 code（HTTP 状态）不算业务码。
 * 数值型 code 路径下原始体在 error.data 里，也一并查。
 */
export function errorCode(e: unknown): string | null {
  const body = asRecord(e)
  if (!body) return null
  const code = body.code ?? asRecord(body.data)?.code
  if (typeof code === 'string' && code) return code
  return null
}

/** 读取业务错误体里的单个载荷字段（tempToken / email / phone / cleanupDays 等） */
export function errorDetail<K extends keyof ApiErrorBody>(e: unknown, key: K): ApiErrorBody[K] {
  return (asRecord(e) ?? {})[key]
}

/** toast 提示错误文案（字符串错误直接展示，不做无意义包装） */
export function showError(e: unknown, fallback: string): void {
  if (typeof e === 'string') {
    showToast(e)
    return
  }
  showToast(errMsg(e, fallback))
}

/**
 * ACCOUNT_DEACTIVATED 弹窗（与 PC SupportModal variant=deactivated 同口径）：
 * 注销冷静期已过 → 弹客服信息告知「联系客服恢复 + 数据 N 天后彻底删除」。
 * cleanupDays 取自错误体，缺省 30。客服联系方式读运行时配置，缺省回退硬编码兜底值。
 */
export function showAccountDeactivatedDialog(cleanupDays?: number): void {
  const days = numField({ cleanupDays }, 'cleanupDays') ?? 30
  const { config } = useRuntimeConfig()
  const supportEmail = config.value.supportEmail || 'support@cloudcad.com'
  const supportPhone = config.value.supportPhone || '400-123-4567'

  const contactItem = (label: string, value: string, href: string) => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="color:var(--text-tertiary);min-width:6em">${label}</span>
      <a href="${href}" style="color:var(--primary);word-break:break-all">${value}</a>
    </div>`

  showDialog({
    title: t('账号已注销'),
    messageAlign: 'left',
    message: `
      <p style="color:var(--text-secondary);line-height:1.7">
        ${t('您的账号已注销且已过冷静期，请联系客服恢复账户。')}<br />
        ${t('数据将在')}
        <strong style="color:var(--danger)">${days}</strong>
        ${t('天后彻底删除，逾期无法恢复。')}
      </p>
      <div style="margin-top:14px">
        ${contactItem(t('客服邮箱：'), supportEmail, `mailto:${supportEmail}`)}
        ${contactItem(t('客服电话：'), supportPhone, `tel:${supportPhone}`)}
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="color:var(--text-tertiary);min-width:6em">${t('工作时间：')}</span>
          <span style="color:var(--text-secondary)">${t('周一至周五 9:00-18:00')}</span>
        </div>
      </div>`,
    confirmButtonText: t('我知道了'),
  })
}
